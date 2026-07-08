// src/services/voice/VoiceTransportFactory.ts
import FastRTCClient from "./FastRTCClient";
import WebSocketClient from "./WebSocketClient";

export type VoiceTransportState =
    | "idle"
    | "connecting"
    | "connected"
    | "disconnected"
    | "error";

export interface TranscriptMessage {
    text: string;
    final: boolean;
    timestamp: number;
    role?: "user" | "assistant" | "caller" | "agent";
}

export interface AudioChunk {
    pcm: Int16Array;
    sampleRate: number;
}

export interface VoiceTransportEvents {
    onStateChange?: (state: VoiceTransportState) => void;
    onTranscript?: (message: TranscriptMessage) => void;
    onAudio?: (chunk: AudioChunk) => void;
    onError?: (error: Error) => void;
    onDisconnected?: () => void;
}

export interface VoiceTransport {
    connect(sessionId: string): Promise<void>;
    disconnect(): Promise<void>;
    startMicrophone(): Promise<void>;
    stopMicrophone(): Promise<void>;
    sendAudio(audio: Int16Array): void;
    setEvents(events: VoiceTransportEvents): void;
    isConnected(): boolean;
}

export class VoiceTransportFactory {
    public static create(
        type: "fastrtc" | "websocket",
        backendUrl: string
    ): VoiceTransport {
        if (type === "fastrtc") {
            return new FastRTCClient(backendUrl);
        } else {
            return new WebSocketClient(backendUrl);
        }
    }
}