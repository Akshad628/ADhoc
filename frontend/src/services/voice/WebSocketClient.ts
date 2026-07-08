import {
    VoiceTransport,
    VoiceTransportEvents,
    VoiceTransportState,
    AudioChunk
} from "./VoiceTransportFactory";

const SAMPLE_RATE = 24000;
const MIC_SAMPLE_RATE = 16000;
const SEND_INTERVAL_MS = 500;
const ACCUM_TARGET_MS = 150;

export default class WebSocketClient implements VoiceTransport {
    private ws: WebSocket | null = null;
    private audioContext: AudioContext | null = null;
    private workletNode: AudioWorkletNode | null = null;
    private scriptProcessorNode: ScriptProcessorNode | null = null;
    private mediaStream: MediaStream | null = null;
    private sourceNode: MediaStreamAudioSourceNode | null = null;
    private events: VoiceTransportEvents = {};
    private sessionId = "";
    private connected = false;
    private muted = false;
    private shouldSendAudio = true;
    private audioQueue: Int16Array[] = [];
    private audioAccum: Int16Array[] = [];
    private playing = false;
    private micBuffer: number[] = [];
    private lastSendTime = 0;

    constructor(private backend: string = "http://localhost:8000") {}

    public setEvents(events: VoiceTransportEvents): void {
        this.events = events;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public async connect(sessionId: string): Promise<void> {
        this.sessionId = sessionId;
        this.events.onStateChange?.("connecting");

        await this.initializeAudio();

        return new Promise((resolve, reject) => {
            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const backendHost = this.backend.replace(/^https?:\/\//, "");
            this.ws = new WebSocket(`${wsProtocol}//${backendHost}/ws/voice/${sessionId}`);
            this.ws.binaryType = "arraybuffer";

            this.ws.onopen = async () => {
                this.connected = true;
                this.events.onStateChange?.("connected");
                try {
                    await this.startMicrophone();
                    resolve();
                } catch (err) {
                    reject(err);
                }
            };

            this.ws.onerror = (err) => {
                this.connected = false;
                this.events.onStateChange?.("error");
                this.events.onError?.(new Error("WebSocket connection failed"));
                reject(err);
            };

            this.ws.onclose = () => {
                this.connected = false;
                this.events.onDisconnected?.();
                this.events.onStateChange?.("disconnected");
            };

            this.ws.onmessage = (e) => {
                this.handleIncomingMessage(e);
            };
        });
    }

    public async disconnect(): Promise<void> {
        await this.stopMicrophone();

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.audioContext) {
            try {
                await this.audioContext.close();
            } catch (err) {
                console.error("Error closing AudioContext", err);
            }
            this.audioContext = null;
        }

        this.audioQueue = [];
        this.audioAccum = [];
        this.connected = false;
        this.events.onStateChange?.("disconnected");
    }

    private async initializeAudio() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: SAMPLE_RATE,
            });
        }

        if (this.audioContext.state === "suspended") {
            await this.audioContext.resume();
        }
    }

    public async startMicrophone(): Promise<void> {
        if (!this.audioContext) return;

        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: MIC_SAMPLE_RATE,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
            video: false,
        });

        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

        try {
            const processorURL = this.createWorklet();
            await this.audioContext.audioWorklet.addModule(processorURL);

            this.workletNode = new AudioWorkletNode(this.audioContext, "mic-processor");
            this.sourceNode.connect(this.workletNode);

            this.workletNode.port.onmessage = (event) => {
                if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
                if (this.muted) return;
                if (!this.shouldSendAudio) return;

                const pcm = event.data as Int16Array;
                for (let i = 0; i < pcm.length; i++) {
                    this.micBuffer.push(pcm[i]);
                }

                const now = Date.now();
                if (now - this.lastSendTime >= SEND_INTERVAL_MS && this.micBuffer.length > 0) {
                    const chunk = new Int16Array(this.micBuffer);
                    this.ws.send(chunk.buffer);
                    this.micBuffer = [];
                    this.lastSendTime = now;
                }
            };
        } catch (workletErr) {
            console.warn("AudioWorklet failed, falling back to ScriptProcessor", workletErr);
            this.startFallbackProcessor();
        }
    }

    public async stopMicrophone(): Promise<void> {
        if (this.workletNode) {
            this.workletNode.disconnect();
            this.workletNode = null;
        }

        if (this.scriptProcessorNode) {
            this.scriptProcessorNode.disconnect();
            this.scriptProcessorNode = null;
        }

        if (this.sourceNode) {
            this.sourceNode.disconnect();
            this.sourceNode = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach((t) => t.stop());
            this.mediaStream = null;
        }
    }

    public sendAudio(audio: Int16Array): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(audio.buffer);
    }

    private handleIncomingMessage(event: MessageEvent): void {
        try {
            // Check if string message or binary
            if (typeof event.data === "string") {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case "transcript":
                        this.events.onTranscript?.({
                            text: data.text,
                            final: true,
                            timestamp: Date.now(),
                        });
                        break;
                    case "ai_response":
                        this.shouldSendAudio = false;
                        this.micBuffer = [];
                        break;
                    case "audio":
                        this.handleIncomingAudio(data.data);
                        break;
                    case "error":
                        this.events.onError?.(new Error(data.message ?? "Unknown backend error"));
                        break;
                }
            }
        } catch (err) {
            console.error("Message parse failed", err);
        }
    }

    private handleIncomingAudio(base64: string) {
        try {
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            let byteLength = bytes.length;
            if (byteLength % 2 !== 0) byteLength--;

            if (byteLength < 2) return;

            const pcm = new Int16Array(bytes.buffer, 0, byteLength / 2);
            this.audioQueue.push(pcm);

            if (this.events.onAudio) {
                this.events.onAudio({ pcm, sampleRate: SAMPLE_RATE });
            }

            if (!this.playing) {
                this.processPlaybackQueue();
            }
        } catch (err) {
            console.error("Audio decode failed", err);
        }
    }

    private async processPlaybackQueue() {
        if (this.playing) return;
        this.playing = true;

        try {
            while (this.audioQueue.length || this.audioAccum.length) {
                while (this.audioQueue.length) {
                    const chunk = this.audioQueue.shift();
                    if (chunk) {
                        this.audioAccum.push(chunk);
                    }
                }

                const samples = this.audioAccum.reduce((s, c) => s + c.length, 0);
                const duration = (samples / SAMPLE_RATE) * 1000;

                if (duration >= ACCUM_TARGET_MS || this.audioQueue.length === 0) {
                    if (samples > 0) {
                        const merged = new Int16Array(samples);
                        let offset = 0;
                        for (const c of this.audioAccum) {
                            merged.set(c, offset);
                            offset += c.length;
                        }
                        this.audioAccum = [];
                        await this.playPCM(merged);
                    }
                }

                if (this.audioQueue.length === 0 && this.audioAccum.length === 0) {
                    await new Promise((r) => setTimeout(r, 40));
                }
            }
        } finally {
            this.playing = false;
            this.shouldSendAudio = true;
            this.micBuffer = [];
            this.lastSendTime = Date.now();
        }
    }

    private async playPCM(pcm: Int16Array) {
        if (!this.audioContext) return;

        return new Promise<void>((resolve) => {
            const float = new Float32Array(pcm.length);
            for (let i = 0; i < pcm.length; i++) {
                float[i] = pcm[i] / 32768;
            }

            const buffer = this.audioContext!.createBuffer(1, float.length, SAMPLE_RATE);
            buffer.copyToChannel(float, 0);

            const source = this.audioContext!.createBufferSource();
            source.buffer = buffer;
            source.connect(this.audioContext!.destination);
            source.onended = () => resolve();
            source.start();
        });
    }

    private createWorklet(): string {
        const processor = `
        class MicProcessor extends AudioWorkletProcessor {
            process(inputs) {
                const input = inputs[0];
                if (input && input[0]) {
                    const channel = input[0];
                    const pcm = new Int16Array(channel.length);
                    for (let i = 0; i < channel.length; i++) {
                        pcm[i] = Math.max(-1, Math.min(1, channel[i])) * 0x7FFF;
                    }
                    this.port.postMessage(pcm);
                }
                return true;
            }
        }
        registerProcessor("mic-processor", MicProcessor);
        `;

        const blob = new Blob([processor], { type: "application/javascript" });
        return URL.createObjectURL(blob);
    }

    private startFallbackProcessor() {
        if (!this.audioContext || !this.mediaStream) return;

        this.scriptProcessorNode = this.audioContext.createScriptProcessor(4096, 1, 1);
        this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

        this.sourceNode.connect(this.scriptProcessorNode);
        this.scriptProcessorNode.connect(this.audioContext.destination);

        this.scriptProcessorNode.onaudioprocess = (event) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            if (this.muted) return;
            if (!this.shouldSendAudio) return;

            const inputBuffer = event.inputBuffer.getChannelData(0);
            const pcm = new Int16Array(inputBuffer.length);
            for (let i = 0; i < inputBuffer.length; i++) {
                pcm[i] = Math.max(-1, Math.min(1, inputBuffer[i])) * 0x7FFF;
            }

            for (let i = 0; i < pcm.length; i++) {
                this.micBuffer.push(pcm[i]);
            }

            const now = Date.now();
            if (now - this.lastSendTime >= SEND_INTERVAL_MS && this.micBuffer.length > 0) {
                const chunk = new Int16Array(this.micBuffer);
                this.ws.send(chunk.buffer);
                this.micBuffer = [];
                this.lastSendTime = now;
            }
        };
    }

    public setMuted(muted: boolean) {
        this.muted = muted;
        if (this.mediaStream) {
            this.mediaStream.getAudioTracks().forEach((t) => (t.enabled = !muted));
        }
    }
}