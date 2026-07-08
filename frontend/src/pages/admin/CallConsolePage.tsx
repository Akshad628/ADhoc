import { useEffect, useMemo, useState, useRef } from 'react'
import toast from 'react-hot-toast'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Clock3, Phone, PhoneCall, Radio, UserRound } from 'lucide-react'

type Agent = {
  id: string
  name: string
  phone_number?: string | null
}

type CallStatus = 'idle' | 'dialing' | 'ringing' | 'connected' | 'ai_speaking' | 'student_speaking' | 'thinking' | 'ended'

type TranscriptMessage = {
  role: 'Agent' | 'Student'
  text: string
}

const agentOrder = [
  'Admissions Agent',
  'Counselling Agent',
  'Onboarding Agent',
  'Fee Reminder Agent',
  'Outreach Agent',
]

function formatTimer(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function sortAgents(agents: Agent[]) {
  return [...agents].sort((a, b) => {
    const aIndex = agentOrder.indexOf(a.name)
    const bIndex = agentOrder.indexOf(b.name)
    const aRank = aIndex === -1 ? Number.MAX_SAFE_INTEGER : aIndex
    const bRank = bIndex === -1 ? Number.MAX_SAFE_INTEGER : bIndex

    return aRank - bRank || a.name.localeCompare(b.name)
  })
}

export default function CallConsolePage() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [countryCode, setCountryCode] = useState('+91')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [callStatus, setCallStatus] = useState<CallStatus>('idle')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null)
  const [loadingAgents, setLoadingAgents] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [callId, setCallId] = useState<string | null>(null)
  const [transcript, setTranscript] = useState<TranscriptMessage[]>([])
  
  const monitorWsRef = useRef<WebSocket | null>(null)

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  )

  useEffect(() => {
    let isMounted = true

    const loadAgents = async () => {
      try {
        setLoadingAgents(true)
        setLoadError('')

        const token = localStorage.getItem('token')
        const response = await fetch('http://localhost:8000/api/agents', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!response.ok) {
          throw new Error('Failed to load agents')
        }

        const data = (await response.json()) as Agent[]
        const sortedAgents = sortAgents(Array.isArray(data) ? data : [])

        if (!isMounted) return

        setAgents(sortedAgents)
        setSelectedAgentId(sortedAgents[0]?.id ?? '')
      } catch (error) {
        if (!isMounted) return

        console.error(error)
        setLoadError('Unable to load agents right now.')
      } finally {
        if (isMounted) {
          setLoadingAgents(false)
        }
      }
    }

    loadAgents()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (callStatus === 'idle' || callStatus === 'ended' || !callStartedAt) {
      return
    }

    const syncElapsedTime = () => {
      setElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000))
    }

    syncElapsedTime()
    const intervalId = window.setInterval(syncElapsedTime, 250)

    return () => window.clearInterval(intervalId)
  }, [callStartedAt, callStatus])

  useEffect(() => {
    return () => {
      if (monitorWsRef.current) {
        monitorWsRef.current.close()
      }
    }
  }, [])

  const connectMonitorWebSocket = (cid: string) => {
    if (monitorWsRef.current) {
      monitorWsRef.current.close()
    }

    const wsUrl = `ws://localhost:8000/ws/calls/monitor/${cid}`
    const ws = new WebSocket(wsUrl)
    monitorWsRef.current = ws

    ws.onopen = () => {
      console.log('Connected to call monitor WebSocket')
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'status') {
          const backendStatus = data.status
          if (backendStatus == 'ringing') {
            setCallStatus('ringing')
          } else if (backendStatus === 'answered') {
            setCallStatus('connected')
          } else if (backendStatus === 'ai_speaking') {
            setCallStatus('ai_speaking')
          } else if (backendStatus === 'student_speaking') {
            setCallStatus('student_speaking')
          } else if (backendStatus === 'thinking') {
            setCallStatus('thinking')
          } else if (backendStatus === 'listening') {
            setCallStatus('connected')
          } else if (backendStatus === 'completed') {
            setCallStatus('ended')
            ws.close()
          }
        } else if (data.type === 'transcript') {
          setTranscript((prev) => {
            // Deduplicate incoming transcript items if needed
            const last = prev[prev.length - 1]
            if (last && last.role === data.role && last.text === data.text) {
              return prev
            }
            return [
              ...prev,
              {
                role: data.role,
                text: data.text,
              },
            ]
          })
        }
      } catch (err) {
        console.error('Error parsing monitor message:', err)
      }
    }

    ws.onclose = () => {
      console.log('Monitor WebSocket closed')
    }

    ws.onerror = (err) => {
      console.error('Monitor WebSocket error:', err)
    }
  }

  const initiateCall = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch('http://localhost:8000/api/calls/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          agent_id: selectedAgentId,
          phone_number: `${countryCode}${phoneNumber}`,
          topic: 'Admission Counseling',
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to initiate call')
      }

      const data = await response.json()
      setCallId(data.call_id)
      setTranscript([])
      connectMonitorWebSocket(data.call_id)
    } catch (err) {
      console.error(err)
      toast.error('Failed to initiate call.')
      setCallStatus('idle')
    }
  }

  const endCall = async () => {
    if (!callId) return
    try {
      const token = localStorage.getItem('token')
      await fetch(`http://localhost:8000/api/calls/${callId}/end`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
    } catch (err) {
      console.error(err)
    }
  }

  const handleMakeCall = async () => {
    if (!selectedAgent || !countryCode.trim() || !phoneNumber.trim()) {
      return
    }

    setCallStatus('dialing')
    setElapsedSeconds(0)
    setCallStartedAt(Date.now())
    toast.success('Dialing...')
    await initiateCall()
  }

  const handleEndCall = async () => {
    await endCall()
    setCallStatus('ended')
    toast.success('Call ended')
  }

  const callInProgress = callStatus !== 'idle' && callStatus !== 'ended'

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="space-y-6"
    >
      <button
        type="button"
        onClick={() => navigate('/admin/voice-agents')}
        className="inline-flex items-center gap-2 text-sm text-zinc-400 transition-colors hover:text-white"
      >
        <ArrowLeft size={16} />
        Back to Voice Agents
      </button>

      <div className="glass rounded-2xl p-6 shadow-2xl shadow-purple-950/20">
        <div className="mb-6 border-b border-white/10 pb-5">
          <h1 className="text-3xl font-bold text-white">Voice Calling Console</h1>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-zinc-300">Agent</span>
            <select
              value={selectedAgentId}
              onChange={(event) => setSelectedAgentId(event.target.value)}
              disabled={loadingAgents || callInProgress}
              className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition-all focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingAgents ? (
                <option value="">Loading agents...</option>
              ) : (
                agents.map((agent) => (
                  <option key={agent.id} value={agent.id} className="bg-zinc-950 text-white">
                    {agent.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <div className="grid grid-cols-[120px_1fr] gap-3">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">Country Code</span>
              <input
                type="text"
                value={countryCode}
                onChange={(event) => setCountryCode(event.target.value)}
                disabled={callInProgress}
                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-zinc-300">Phone Number</span>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(event) => setPhoneNumber(event.target.value)}
                placeholder="XXXXXXXXXX"
                disabled={callInProgress}
                className="h-12 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none transition-all placeholder:text-zinc-600 focus:border-purple-500/60 focus:ring-2 focus:ring-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </label>
          </div>

          <button
            type="button"
            onClick={handleMakeCall}
            disabled={!selectedAgent || !phoneNumber.trim() || !countryCode.trim() || callInProgress}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-purple-600 px-6 text-sm font-semibold text-white shadow-lg shadow-purple-950/40 transition-all hover:bg-purple-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400 disabled:shadow-none"
          >
            <PhoneCall size={18} />
            Make Call
          </button>
        </div>

        {loadError && <p className="mt-3 text-sm text-red-300">{loadError}</p>}
      </div>

      <div className="glass rounded-2xl p-6">
        {callStatus === 'idle' && (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="max-w-sm text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/15 text-purple-300">
                <UserRound size={24} />
              </div>
              <h2 className="text-xl font-semibold text-white">Select Agent</h2>
              <p className="mt-2 text-sm text-zinc-400">Enter Number</p>
              <p className="mt-4 text-sm text-zinc-500">Use the Make Call button to start a monitored test call.</p>
            </div>
          </div>
        )}

        {(callStatus === 'dialing' || callStatus === 'ringing') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex min-h-[300px] items-center justify-center"
          >
            <div className="text-center">
              <div className="relative mx-auto mb-8 flex h-28 w-28 items-center justify-center">
                {[0, 1, 2].map((ring) => (
                  <motion.div
                    key={ring}
                    className="absolute inset-0 rounded-full border border-purple-400/40"
                    animate={{ opacity: [0.8, 0], scale: [0.7, 1.5] }}
                    transition={{ duration: 1.8, delay: ring * 0.35, repeat: Infinity, ease: 'easeOut' }}
                  />
                ))}
                <div className="relative z-10 flex h-20 w-20 items-center justify-center rounded-full bg-purple-600 text-white shadow-xl shadow-purple-950/50">
                  <Phone size={28} />
                </div>
              </div>

              <h2 className="text-2xl font-bold text-white">{selectedAgent?.name}</h2>
              <p className="mt-2 text-purple-300">
                {callStatus === 'ringing' ? 'Ringing...' : 'Dialing...'}
              </p>
              <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/5 px-4 py-2 font-mono text-lg text-white">
                <Clock3 size={18} className="text-zinc-400" />
                {formatTimer(elapsedSeconds)}
              </div>
            </div>
          </motion.div>
        )}

        {(callStatus === 'connected' || callStatus === 'ai_speaking' || callStatus === 'student_speaking' || callStatus === 'thinking') && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex min-h-[300px] flex-col items-center justify-center text-center"
          >
            <div className={`mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium ${
              callStatus === 'ai_speaking'
                ? 'bg-cyan-500/15 text-cyan-300 animate-pulse'
                : callStatus === 'student_speaking'
                ? 'bg-purple-500/15 text-purple-300 animate-pulse'
                : callStatus === 'thinking'
                ? 'bg-pink-500/15 text-pink-300 animate-pulse'
                : 'bg-emerald-500/15 text-emerald-300'
            }`}>
              <Radio size={16} />
              {callStatus === 'ai_speaking'
                ? 'AI Speaking'
                : callStatus === 'student_speaking'
                ? 'Student Speaking'
                : callStatus === 'thinking'
                ? 'Thinking...'
                : 'Connected'}
            </div>
            <h2 className="text-2xl font-bold text-white">{formatTimer(elapsedSeconds)}</h2>
            <p className="mt-2 text-sm text-zinc-400">{selectedAgent?.name}</p>

            <div className="my-8 flex h-20 items-center justify-center gap-1.5">
              {Array.from({ length: 24 }).map((_, index) => (
                <motion.div
                  key={index}
                  className="w-1.5 rounded-full bg-gradient-to-t from-purple-500 to-cyan-300"
                  animate={{
                    height: callStatus === 'thinking'
                      ? [14, 24, 14]
                      : callStatus === 'ai_speaking' || callStatus === 'student_speaking'
                      ? [14, 54, 20, 42, 14]
                      : [14, 14, 14]
                  }}
                  transition={{
                    duration: callStatus === 'thinking' ? 0.6 : 1.1,
                    delay: index * 0.04,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleEndCall}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-500 px-6 text-sm font-semibold text-white shadow-lg shadow-red-950/30 transition-all hover:bg-red-400"
            >
              <Phone size={18} />
              End Call
            </button>
          </motion.div>
        )}

        {callStatus === 'ended' && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-[300px] items-center justify-center text-center"
          >
            <div>
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-zinc-300">
                <Phone size={24} />
              </div>
              <h2 className="text-2xl font-bold text-white">Call Ended</h2>
              <p className="mt-2 text-zinc-400">Duration: {elapsedSeconds} seconds</p>
            </div>
          </motion.div>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.35 }}
        className="glass rounded-2xl p-6"
      >
        <h2 className="mb-5 text-sm font-semibold text-zinc-400">LIVE TRANSCRIPT</h2>
        <div className="space-y-4">
          {transcript.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`flex ${message.role === 'Student' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-lg ${
                  message.role === 'Student'
                    ? 'rounded-br-sm bg-purple-600/25 text-white shadow-purple-950/20'
                    : 'rounded-bl-sm bg-white/5 text-zinc-200 shadow-black/10'
                }`}
              >
                <span className="mb-1 block text-xs font-semibold text-purple-300">{message.role}</span>
                {message.text}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
