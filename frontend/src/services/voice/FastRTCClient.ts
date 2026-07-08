import {
    VoiceTransport,
    VoiceTransportEvents,
    VoiceTransportState
} from "./VoiceTransportFactory";

export default class FastRTCClient implements VoiceTransport {
    private pc: RTCPeerConnection | null = null;
    private localStream?: MediaStream;
    private events: VoiceTransportEvents = {};
    private connected = false;

    constructor(
        private backend: string = "http://localhost:8000"
    ) {}

    public setEvents(events: VoiceTransportEvents): void {
        this.events = events;
    }

    public isConnected(): boolean {
        return this.connected;
    }

    public async connect(sessionId: string): Promise<void> {
        this.events.onStateChange?.("connecting");
        try {
            this.pc = new RTCPeerConnection({
                iceServers: [
                    { urls: "stun:stun.l.google.com:19302" }
                ]
            });

            this.pc.ontrack = (event) => {
                const remoteStream = event.streams[0];
                if (remoteStream) {
                    console.log("FastRTCClient: playing remote audio track");
                    const audio = new Audio();
                    audio.srcObject = remoteStream;
                    audio.play().catch(e => console.error("WebRTC audio play failed:", e));

                    // Volume analysis to trigger visual waves on page
                    try {
                        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                        const source = audioContext.createMediaStreamSource(remoteStream);
                        const analyser = audioContext.createAnalyser();
                        analyser.fftSize = 256;
                        source.connect(analyser);

                        const bufferLength = analyser.frequencyBinCount;
                        const dataArray = new Uint8Array(bufferLength);

                        const checkVolume = () => {
                            if (!this.connected) return;
                            analyser.getByteFrequencyData(dataArray);
                            let sum = 0;
                            for (let i = 0; i < bufferLength; i++) {
                                sum += dataArray[i];
                            }
                            const average = sum / bufferLength;

                            if (average > 8) {
                                // Trigger onAudio to animate page waves
                                this.events.onAudio?.({
                                    pcm: new Int16Array(100),
                                    sampleRate: 24000
                                });
                            }
                            requestAnimationFrame(checkVolume);
                        };
                        checkVolume();
                    } catch (ae) {
                        console.error("Volume analyzer setup failed:", ae);
                    }
                }
            };

            this.pc.oniceconnectionstatechange = () => {
                if (this.pc?.iceConnectionState === "connected") {
                    this.connected = true;
                    this.events.onStateChange?.("connected");
                } else if (
                    this.pc?.iceConnectionState === "failed" ||
                    this.pc?.iceConnectionState === "closed"
                ) {
                    this.connected = false;
                    this.events.onStateChange?.("disconnected");
                    this.events.onDisconnected?.();
                }
            };

            await this.startMicrophone();

            this.localStream?.getTracks().forEach(track => {
                this.pc!.addTrack(track, this.localStream!);
            });

            // Create DataChannel required by FastRTC signaling Mixin
            const dc = this.pc.createDataChannel("datachannel");
            dc.onmessage = (e) => {
                console.log("FastRTC DataChannel message:", e.data);
                try {
                    const data = JSON.parse(e.data);
                    if (data.type === "transcript") {
                        this.events.onTranscript?.({
                            text: data.text,
                            role: data.role === "user" ? "user" : "assistant",
                            final: true,
                            timestamp: Date.now()
                        });
                    }
                } catch (err) {
                    console.error("Failed to parse DataChannel message:", err);
                }
            };

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            // Wait for ICE gathering completion
            await new Promise<void>((resolve) => {
                if (this.pc!.iceGatheringState === "complete") {
                    resolve();
                    return;
                }
                const handler = () => {
                    if (this.pc!.iceGatheringState === "complete") {
                        this.pc!.removeEventListener("icegatheringstatechange", handler);
                        resolve();
                    }
                };
                this.pc!.addEventListener("icegatheringstatechange", handler);
            });

            const backendHttp = this.backend.replace(/^ws/, "http");
            const response = await fetch(
                `${backendHttp}/fastrtc/webrtc/offer`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        sdp: this.pc.localDescription?.sdp,
                        type: this.pc.localDescription?.type,
                        webrtc_id: sessionId,
                    }),
                }
            );

            if (!response.ok) {
                throw new Error("FastRTC negotiation failed");
            }

            const answer = await response.json();
            await this.pc.setRemoteDescription(answer);
            
            this.connected = true;
            this.events.onStateChange?.("connected");
        } catch (err: any) {
            this.connected = false;
            this.events.onStateChange?.("error");
            this.events.onError?.(err);
            throw err;
        }
    }

    public async disconnect(): Promise<void> {
        this.events.onStateChange?.("disconnected");
        await this.stopMicrophone();
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }
        this.connected = false;
        this.events.onDisconnected?.();
    }

    public async startMicrophone(): Promise<void> {
        if (!this.localStream) {
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false,
            });
        }
        this.localStream.getAudioTracks().forEach(t => t.enabled = true);
    }

    public async stopMicrophone(): Promise<void> {
        this.localStream?.getTracks().forEach(t => t.stop());
        this.localStream = undefined;
    }

    public sendAudio(audio: Int16Array): void {
        // Piped automatically via RTCPeerConnection track
    }

    public getRemoteStream(): MediaStream | null {
        if (!this.pc) return null;
        const receivers = this.pc.getReceivers();
        const tracks = receivers.map(r => r.track).filter(t => t.kind === "audio");
        if (tracks.length > 0) {
            const stream = new MediaStream();
            tracks.forEach(t => stream.addTrack(t));
            return stream;
        }
        return null;
    }
}