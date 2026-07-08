import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Phone, PhoneOff, Mic, MicOff, Volume2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { VoiceTransportFactory, VoiceTransport } from '../services/voice/VoiceTransportFactory'

// ─── COMPONENT ───────────────────────────────────────────────────────
export default function VoiceCallPage() {
  const { user } = useAuth()
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'active' | 'ended'>('idle')
  const [timer, setTimer] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [messages, setMessages] = useState<{ role: 'agent' | 'caller', text: string }[]>([])
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false)
  const [isUserSpeaking, setIsUserSpeaking] = useState(false)
  const [callStatus, setCallStatus] = useState<'listening' | 'processing' | 'speaking' | 'idle'>('idle')

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sessionIdRef = useRef<string>(`session_${Date.now()}`)
  const transportRef = useRef<VoiceTransport | null>(null)

  // Timer
  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [callState])

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  // End call helper
  const endCall = useCallback(async () => {
    if (transportRef.current) {
      try {
        await transportRef.current.disconnect()
      } catch (e) {
        console.error("Error during transport disconnect", e)
      }
      transportRef.current = null
    }

    setCallState('ended')
    setIsAgentSpeaking(false)
    setIsUserSpeaking(false)
    setCallStatus('idle')
  }, [])

  // Start call with fallback architecture
  const startCall = useCallback(async () => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }

    setCallState('connecting')
    setTimer(0)
    setMessages([])
    setIsAgentSpeaking(false)
    setIsUserSpeaking(false)
    setCallStatus('idle')
    sessionIdRef.current = `session_${Date.now()}`

    const sessionId = sessionIdRef.current
    const backendUrl = "http://localhost:8000"

    let useWebRTC = false
    try {
      const response = await fetch(`${backendUrl}/api/voice/fastrtc-status`)
      if (response.ok) {
        const status = await response.json()
        useWebRTC = status.available && status.stream_ready
      }
    } catch (e) {
      console.warn("FastRTC status check failed, using WebSocket fallback:", e)
    }

    const tryConnect = async (type: "fastrtc" | "websocket") => {
      const client = VoiceTransportFactory.create(type, backendUrl)
      transportRef.current = client

      client.setEvents({
        onStateChange: (state) => {
          if (state === "connecting") setCallState("connecting")
          if (state === "connected") {
            setCallState("active")
            setCallStatus("listening")
            toast.success(`Connected to AI Agent (${type === "fastrtc" ? "WebRTC" : "WebSocket"})`)
          }
          if (state === "error") {
            setCallState("idle")
            setCallStatus("idle")
          }
          if (state === "disconnected") {
            setCallState("ended")
            setCallStatus("idle")
          }
        },
        onTranscript: (msg) => {
          const role = msg.role === 'assistant' || msg.role === 'agent' ? 'agent' : 'caller';
          setMessages(prev => [...prev, { role, text: msg.text }]);
          if (role === 'caller') {
            setIsUserSpeaking(false);
            setCallStatus('processing');
          }
        },
        onAudio: (chunk) => {
          setIsAgentSpeaking(true)
          setCallStatus('speaking')
          const duration = (chunk.pcm.length / chunk.sampleRate) * 1000
          setTimeout(() => {
            setIsAgentSpeaking(false)
            setCallStatus('listening')
          }, duration)
        },
        onError: (err) => {
          console.error(`${type} transport error:`, err)
        },
        onDisconnected: () => {
          endCall()
        }
      })

      await client.connect(sessionId)
    }

    try {
      if (useWebRTC) {
        console.log("Attempting WebRTC connection...")
        await tryConnect("fastrtc")
      } else {
        console.log("FastRTC not available, using WebSocket...")
        await tryConnect("websocket")
      }
    } catch (err) {
      console.warn("Failed to connect with primary transport, falling back to WebSocket...", err)
      try {
        if (useWebRTC) {
          toast("WebRTC connection failed. Falling back to WebSocket failsafe...")
          await tryConnect("websocket")
        } else {
          toast.error("Failed to connect")
          setCallState("idle")
        }
      } catch (fallbackErr) {
        console.error("Fallback connection also failed:", fallbackErr)
        toast.error("Connection failed")
        setCallState("idle")
      }
    }
  }, [user, endCall])

  const handleMute = () => {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    if (transportRef.current) {
      const client = transportRef.current as any
      if (typeof client.setMuted === "function") {
        client.setMuted(newMuted)
      } else {
        if (newMuted) {
          transportRef.current.stopMicrophone()
        } else {
          transportRef.current.startMicrophone()
        }
      }
    }
  }

  useEffect(() => {
    return () => { endCall() }
  }, [endCall])

  const getStatusText = () => {
    switch (callStatus) {
      case 'listening': return 'Listening... Speak now'
      case 'processing': return 'Processing...'
      case 'speaking': return 'AI is speaking...'
      default: return ''
    }
  }

  const getStatusColor = () => {
    switch (callStatus) {
      case 'listening': return 'text-emerald-400'
      case 'processing': return 'text-yellow-400'
      case 'speaking': return 'text-cyan-400'
      default: return 'text-zinc-500'
    }
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-6 relative">
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-zinc-400 hover:text-white transition-all font-mono text-xs uppercase tracking-wider">
        <span>← Back home</span>
      </Link>

      <div className="absolute top-6 right-6 flex items-center gap-2 select-none">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
          <span className="text-white font-bold text-sm">A</span>
        </div>
        <span className="font-extrabold text-white text-sm">ADhoc<span className="text-gradient-neon font-black">.ai</span></span>
      </div>

      <AnimatePresence mode="wait">
        {callState === 'idle' && (
          <motion.div key="idle" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="text-center flex flex-col items-center justify-center max-w-md glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-2xl">
            <h1 className="text-3xl font-extrabold mb-4 text-white tracking-tight">Try our AI Voice Agent</h1>
            <p className="text-zinc-400 mb-8 leading-relaxed text-sm">
              Experience a real-time voice conversation with our Adhoc Agent.
              Ask about colleges, courses, careers, and admissions.
            </p>
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={startCall}
              className="w-24 h-24 rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 flex items-center justify-center shadow-2xl shadow-purple-500/30 mx-auto hover:shadow-purple-500/50 transition-all border border-white/10 hover:border-purple-300/30 glow-purple"
            >
              <Phone size={32} className="text-white" />
            </motion.button>
            <p className="mt-4 text-zinc-500 font-mono text-xs tracking-widest uppercase">Tap to call</p>
          </motion.div>
        )}

        {callState === 'connecting' && (
          <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="text-center glass-panel p-8 rounded-3xl border border-white/10 shadow-2xl max-w-sm w-full">
            <div className="relative w-28 h-28 mx-auto mb-6">
              {[...Array(3)].map((_, i) => (
                <motion.div key={i} className="absolute inset-0 rounded-full border-2 border-purple-500/30"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, delay: i * 0.6, repeat: Infinity }} />
              ))}
              <div className="absolute inset-3 rounded-full bg-gradient-to-br from-purple-600 via-pink-500 to-purple-500 flex items-center justify-center shadow-lg border border-white/10">
                <Phone size={28} className="text-white animate-pulse" />
              </div>
            </div>
            <h2 className="text-xl font-bold mb-1 text-white">Connecting...</h2>
            <p className="text-xs text-zinc-500 font-mono tracking-wider">ADHOC AI AGENT</p>
          </motion.div>
        )}

        {(callState === 'active' || callState === 'ended') && (
          <motion.div key="active" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-2xl">
            <div className="glass-panel rounded-2xl p-6 mb-4 border border-white/10 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between mb-4 pb-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-md">
                    <span className="text-white font-extrabold text-sm">AI</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">Adhoc AI</h3>
                    <p className="text-xs text-zinc-500 font-mono">AI Career Counselor</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {formatTime(timer)}
                  </div>
                  <button onClick={endCall} className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 flex items-center justify-center text-red-400 border border-red-500/20 transition-all">
                    <PhoneOff size={16} />
                  </button>
                </div>
              </div>

              {/* Better status indicator */}
              <div className="flex items-center justify-center gap-2 mb-4 h-6">
                <span className={`text-xs font-mono uppercase tracking-widest font-semibold animate-pulse ${getStatusColor()}`}>
                  {getStatusText()}
                </span>
              </div>

              <div className="flex items-center justify-center gap-1 h-16 bg-white/[0.01] border border-white/5 rounded-2xl px-4 py-2">
                {[...Array(40)].map((_, i) => (
                  <motion.div key={i} className="w-1 bg-gradient-to-t from-purple-500 via-pink-500 to-cyan-400 rounded-full shadow-[0_0_8px_rgba(139,92,246,0.3)]"
                    animate={{
                      height: callState === 'active' && (isUserSpeaking || isAgentSpeaking)
                        ? [8, 12 + Math.random() * 28, 8]
                        : 8
                    }}
                    transition={{ duration: 0.4, delay: i * 0.015, repeat: Infinity }} />
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-6 mb-4 h-80 overflow-y-auto border border-white/10 shadow-xl scrollbar-thin">
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                <h4 className="text-[10px] text-zinc-500 font-mono font-bold tracking-widest">LIVE TRANSCRIPT</h4>
                <span className="flex items-center gap-2 text-[10px] font-mono font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  {callState === 'active' ? 'LIVE CONNECTED' : 'CALL ENDED'}
                </span>
              </div>

              <div className="space-y-4">
                {messages.length === 0 && callState === 'active' && (
                  <div className="text-center py-8">
                    <p className="text-zinc-500 text-sm">Say something to start the conversation...</p>
                    <p className="text-zinc-600 text-xs mt-2 font-mono">Try: "What colleges are good for Computer Science?"</p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'caller' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] px-4 py-3 rounded-2xl shadow-lg ${msg.role === 'caller'
                      ? 'bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-tr-none border border-white/10'
                      : 'glass-panel text-zinc-200 rounded-tl-none border border-white/10'
                      }`}>
                      <p className="text-[9px] font-mono font-bold tracking-wider text-purple-400 mb-1">{msg.role === 'agent' ? 'AI AGENT' : 'YOU'}</p>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                  </motion.div>
                ))}

                {callState === 'active' && messages.length > 0 && messages[messages.length - 1].role === 'caller' && !isAgentSpeaking && (
                  <div className="flex justify-start">
                    <div className="glass-panel px-4 py-3 rounded-2xl rounded-tl-none border border-white/10">
                      <div className="flex items-center gap-1.5 h-4">
                        <motion.div className="w-2.5 h-2.5 rounded-full bg-purple-400" animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1, repeat: Infinity }} />
                        <motion.div className="w-2.5 h-2.5 rounded-full bg-purple-400" animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1, delay: 0.2, repeat: Infinity }} />
                        <motion.div className="w-2.5 h-2.5 rounded-full bg-purple-400" animate={{ opacity: [0.3, 1, 0.3], scale: [0.9, 1.1, 0.9] }} transition={{ duration: 1, delay: 0.4, repeat: Infinity }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {callState === 'active' && (
              <div className="flex justify-center gap-4">
                <button onClick={handleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center border transition-all ${isMuted
                    ? 'bg-red-500/20 border-red-500/30 text-red-400 shadow-lg shadow-red-500/10 animate-pulse'
                    : 'glass-panel border-white/15 text-white hover:bg-white/10'
                    }`}>
                  {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <button onClick={endCall}
                  className="w-14 h-14 rounded-full bg-gradient-to-r from-red-600 to-pink-600 text-white flex items-center justify-center transition-all shadow-lg shadow-red-500/20 border border-white/10 hover:border-red-300/30 hover:scale-105">
                  <PhoneOff size={20} />
                </button>
                <button className="w-14 h-14 rounded-full glass-panel border border-white/15 text-white hover:bg-white/10 flex items-center justify-center transition-all">
                  <Volume2 size={20} />
                </button>
              </div>
            )}

            {callState === 'ended' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center p-4">
                <p className="text-zinc-500 font-mono text-xs uppercase tracking-wider mb-4">Call ended • {formatTime(timer)}</p>
                <button onClick={startCall} className="px-8 py-3.5 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white rounded-full font-medium transition-all shadow-lg shadow-purple-500/20 border border-white/10 hover:border-purple-300/30 glow-purple">
                  Call Again
                </button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}