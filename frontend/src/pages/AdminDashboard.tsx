import { useState, useRef, useEffect  } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Phone, Settings, BookOpen, FileText, BarChart3, LogOut, Search, Bell, ChevronRight, TrendingUp, Users, GraduationCap, Clock, CheckCircle, Upload, Sparkles, Mic, PhoneCall, Plus, Trash2, Save, Download } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCalls } from '../hooks/useCalls'
import toast from 'react-hot-toast'

function DashboardHome() {
  const [dashboardData, setDashboardData] = useState<any>(null)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch(
        'http://localhost:8000/api/dashboard/admin',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      setDashboardData(data)
    } catch (error) {
      console.error('Dashboard fetch failed:', error)
    }
  }

  const stats = [
    {
      label: 'Active calls today',
      value: dashboardData?.stats?.active_calls_today ?? 0,
      icon: Phone,
      change: '',
      up: true,
    },
    {
      label: 'Students',
      value: dashboardData?.stats?.students ?? 0,
      icon: Users,
      change: '',
      up: true,
    },
    {
      label: 'Active sessions',
      value: dashboardData?.stats?.active_sessions ?? 0,
      icon: Clock,
      change: '',
      up: true,
    },
  ]

  const activities = dashboardData?.activities ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">
          Welcome back
        </h1>

        <p className="text-zinc-400">
          Here is what your AI workforce did today.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass rounded-2xl p-5 hover:bg-white/10 transition-all group"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <stat.icon
                  size={20}
                  className="text-purple-400"
                />
              </div>

              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  stat.up
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {stat.change}
              </span>
            </div>

            <div className="text-3xl font-bold text-white mb-1">
              {stat.value}
            </div>

            <div className="text-sm text-zinc-500">
              {stat.label}
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass rounded-2xl p-6"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-semibold text-white">
            Recent activity
          </h3>

          <button className="text-sm text-purple-400 hover:text-purple-300">
            View all
          </button>
        </div>

        <div className="space-y-4">
          {activities.map((a, i) => (
            <div
              key={i}
              className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                <CheckCircle
                  size={16}
                  className="text-emerald-400"
                />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">
                  <span className="font-medium">
                    {a.event_data?.agent}
                  </span>

                  {' — '}

                  <span className="text-zinc-400">
                    {a.event_data?.message}
                  </span>
                </p>
              </div>

              <span className="text-xs text-zinc-500 flex-shrink-0">
                {a.time}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  )
}
function VoiceAgentsPage() {
  const [selectedAgent, setSelectedAgent] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const agents = [
    { name: 'Admissions Agent', desc: 'Qualifies leads & books campus tours', status: 'Idle', icon: GraduationCap, phone: '+1 (555) 010-1234' },
    { name: 'Counselling Agent', desc: 'Career & course counselling, 24/7', status: 'Active', icon: Users, phone: '+1 (555) 010-1235' },
    { name: 'Onboarding Agent', desc: 'Walks new students through enrolment', status: 'Idle', icon: CheckCircle, phone: '+1 (555) 010-1236' },
    { name: 'Fee Reminder', desc: 'Polite payment follow-ups in any language', status: 'Active', icon: Phone, phone: '+1 (555) 010-1237' },
    { name: 'Outreach Agent', desc: 'Outbound campaigns across regions', status: 'Idle', icon: PhoneCall, phone: '+1 (555) 010-1238' },
  ]
  const transcript = [
    { role: 'agent' as const, text: "Hi! I am calling from ADhoc Institute of Technology. Is this a good time to chat about your B.Tech application?" },
    { role: 'caller' as const, text: "Yes, please go ahead." },
    { role: 'agent' as const, text: "Great — could you tell me which stream you are most interested in?" },
  ]

  const handleCall = () => {
    if (!isListening) {
      setIsListening(true)
      toast.success('Connecting to voice agent...')
    } else {
      setIsListening(false)
      toast.success('Call ended')
    }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold text-white mb-1">Voice Agents</h1><p className="text-zinc-400">Talk to your AI workforce. Live calls, transcripts and analytics — all in one place.</p></div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs text-zinc-500 font-medium tracking-wider mb-2">PICK AN AGENT</p>
          {agents.map((agent, i) => (
            <motion.button key={agent.name} whileHover={{ x: 4 }} onClick={() => setSelectedAgent(i)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left ${selectedAgent === i ? 'bg-purple-500/20 border border-purple-500/30' : 'glass hover:bg-white/10 border border-white/5'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedAgent === i ? 'bg-purple-500/30' : 'bg-white/5'}`}>
                <agent.icon size={20} className={selectedAgent === i ? 'text-purple-400' : 'text-zinc-400'} />
              </div>
              <div className="flex-1">
                <p className={`font-medium ${selectedAgent === i ? 'text-white' : 'text-zinc-300'}`}>{agent.name}</p>
                <p className="text-xs text-zinc-500">{agent.desc}</p>
                <p className="text-xs text-purple-400 mt-1">{agent.phone}</p>
              </div>
            </motion.button>
          ))}
        </div>
        <div className="lg:col-span-3 space-y-4">
          <div className="glass rounded-2xl p-6 relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center"><GraduationCap size={24} className="text-purple-400" /></div>
                <div>
                  <h3 className="font-semibold text-white text-lg">{agents[selectedAgent].name}</h3>
                  <p className="text-sm text-zinc-400">{agents[selectedAgent].desc}</p>
                  <p className="text-xs text-purple-400 mt-1">{agents[selectedAgent].phone}</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs bg-zinc-500/20 text-zinc-400">{agents[selectedAgent].status}</span>
            </div>
            <div className="flex items-center justify-center gap-0.5 h-16 mb-6">
              {[...Array(50)].map((_, i) => (
                <motion.div key={i} className="w-1 bg-gradient-to-t from-purple-500/60 to-cyan-400/60 rounded-full"
                  animate={{ height: isListening ? [4, 8 + Math.random() * 24, 4] : 4 }}
                  transition={{ duration: 1, delay: i * 0.02, repeat: Infinity }} />
              ))}
            </div>
            <div className="flex justify-center gap-4">
              <button className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"><Mic size={20} /></button>
              <button onClick={handleCall}
                className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all ${isListening ? 'bg-red-500 text-white' : 'bg-white text-black'}`}>
                {isListening ? <Phone size={24} /> : <PhoneCall size={24} />}
              </button>
              <button className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all"><Settings size={20} /></button>
            </div>
            {isListening && (
              <p className="text-center text-sm text-emerald-400 mt-4 animate-pulse">Listening... Speak now</p>
            )}
          </div>
          <div className="glass rounded-2xl p-6">
            <h4 className="text-xs text-zinc-500 font-medium tracking-wider mb-4">LIVE TRANSCRIPT</h4>
            <div className="space-y-3">
              {transcript.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'caller' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-xl text-sm ${msg.role === 'caller' ? 'bg-purple-600/20 text-white rounded-br-md' : 'bg-white/5 text-zinc-300 rounded-bl-md'}`}>
                    <span className="text-xs text-purple-400 block mb-1">{msg.role === 'agent' ? 'Agent' : 'Caller'}</span>{msg.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminStudioPage() {
  const [activeTab, setActiveTab] = useState<'prompt' | 'knowledge' | 'analytics' | 'telephony'>('prompt')
  const [promptText, setPromptText] = useState(`You are the Admissions Agent for ADhoc Institute of Technology.

• Be warm, concise, and respectful
• Always confirm the caller's preferred language
• Qualify the lead on: stream, score, location, budget
• If qualified, book a campus tour for this week
• Never make promises about admission outcomes`)
  const [saved, setSaved] = useState(false)
  const [files, setFiles] = useState([
    { name: 'Programs_Brochure_2026.pdf', size: '2.4 MB', chunks: 128, status: 'Indexed' },
    { name: 'Fee_Structure.xlsx', size: '180 KB', chunks: 42, status: 'Indexed' },
    { name: 'Hostel_Policies.docx', size: '640 KB', chunks: 56, status: 'Indexed' },
    { name: 'FAQ_Admissions.md', size: '24 KB', chunks: 18, status: 'Indexed' },
    { name: 'Scholarship_Guidelines.pdf', size: '1.1 MB', chunks: 73, status: 'Processing' },
  ])
  const { calls: callLogs, total, loading: callLogsLoading } = useCalls(0, 50)
  const [phoneNumbers] = useState([
    { number: '+1 (555) 010-1234', agent: 'Admissions Agent', status: 'Active', calls: 1247 },
    { number: '+1 (555) 010-1235', agent: 'Counselling Agent', status: 'Active', calls: 892 },
    { number: '+1 (555) 010-1236', agent: 'Onboarding Agent', status: 'Active', calls: 456 },
    { number: '+1 (555) 010-1237', agent: 'Fee Reminder', status: 'Active', calls: 2103 },
    { number: '+1 (555) 010-1238', agent: 'Outreach Agent', status: 'Inactive', calls: 0 },
  ])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleSavePrompt = () => {
    setSaved(true)
    toast.success('Prompt saved and deployed!')
    setTimeout(() => setSaved(false), 2000)
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const newFile = { name: file.name, size: `${(file.size / 1024 / 1024).toFixed(1)} MB`, chunks: Math.floor(Math.random() * 100) + 20, status: 'Processing' as const }
      setFiles([...files, newFile])
      toast.success(`Uploading ${file.name}...`)
      setTimeout(() => {
        setFiles(prev => prev.map(f => f.name === file.name ? { ...f, status: 'Indexed' as const } : f))
        toast.success(`${file.name} indexed successfully!`)
      }, 3000)
    }
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-bold text-white mb-1">Admin Studio</h1><p className="text-zinc-400">Train your agents, manage your knowledge base and track performance.</p></div>
      <div className="flex gap-2">
        {[{ id: 'prompt' as const, label: 'Prompt Studio', icon: FileText }, { id: 'knowledge' as const, label: 'Knowledge Base', icon: BookOpen }, { id: 'analytics' as const, label: 'Call Logs', icon: BarChart3 }, { id: 'telephony' as const, label: 'Telephony', icon: Phone }].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-white/10 text-white border border-white/20' : 'text-zinc-400 hover:text-white'}`}>
            <tab.icon size={16} />{tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'prompt' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3"><Sparkles size={18} className="text-purple-400" /><h3 className="font-semibold text-white">Admissions Agent — System Prompt</h3></div>
              <button onClick={handleSavePrompt}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${saved ? 'bg-emerald-500 text-white' : 'bg-white text-black hover:bg-zinc-100'}`}>
                {saved ? <><CheckCircle size={16} />Saved</> : <><Save size={16} />Save & deploy</>}
              </button>
            </div>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              className="w-full h-96 bg-black/30 rounded-xl p-4 text-sm text-zinc-300 font-mono resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 border border-white/10"
            />
          </div>
          <div className="space-y-4">
            <div className="glass rounded-2xl p-5">
              <h4 className="font-medium text-white mb-4">Voice & tone</h4>
              <div className="space-y-3">
                {[{ label: 'Voice', value: 'Aanya · Hindi/English' }, { label: 'Pace', value: 'Natural' }, { label: 'Empathy', value: 'High' }, { label: 'Interruptions', value: 'Allowed' }].map((item) => (
                  <div key={item.label} className="flex justify-between text-sm"><span className="text-zinc-400">{item.label}</span><span className="text-white">{item.value}</span></div>
                ))}
              </div>
            </div>
            <div className="glass rounded-2xl p-5">
              <h4 className="font-medium text-white mb-2">A/B test</h4>
              <p className="text-sm text-zinc-400 mb-4">Run two versions of this prompt against live traffic and pick the winner.</p>
              <button className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm text-white transition-all">+ New variant</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'knowledge' && (
        <div className="space-y-6">
          <div className="glass rounded-2xl p-12 text-center border border-dashed border-white/20 cursor-pointer hover:bg-white/5 transition-all"
            onClick={() => fileInputRef.current?.click()}>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept=".pdf,.docx,.xlsx,.md,.txt" />
            <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4"><Upload size={24} className="text-zinc-400" /></div>
            <h3 className="font-semibold text-white mb-2">Drop documents to train your agents</h3>
            <p className="text-sm text-zinc-400 mb-4">PDF · DOCX · XLSX · MD · TXT · up to 100 MB per file</p>
            <button className="px-6 py-2.5 bg-white text-black rounded-full text-sm font-medium hover:bg-zinc-100 transition-all">Upload files</button>
          </div>
          <div className="glass rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h4 className="font-medium text-white">Indexed sources ({files.length})</h4>
              <button className="text-sm text-purple-400 hover:text-purple-300">Re-index all</button>
            </div>
            <table className="w-full">
              <thead><tr className="text-xs text-zinc-500 border-b border-white/10">
                <th className="text-left px-6 py-3 font-medium">NAME</th>
                <th className="text-left px-6 py-3 font-medium">SIZE</th>
                <th className="text-left px-6 py-3 font-medium">CHUNKS</th>
                <th className="text-left px-6 py-3 font-medium">STATUS</th>
                <th className="text-left px-6 py-3 font-medium"></th>
              </tr></thead>
              <tbody>
                {files.map((f, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm text-white flex items-center gap-2"><FileText size={16} className="text-zinc-500" />{f.name}</td>
                    <td className="px-6 py-4 text-sm text-zinc-400">{f.size}</td>
                    <td className="px-6 py-4 text-sm text-zinc-400">{f.chunks}</td>
                    <td className="px-6 py-4"><span className={`text-xs px-2.5 py-1 rounded-full ${f.status === 'Indexed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{f.status}</span></td>
                    <td className="px-6 py-4"><button className="text-zinc-500 hover:text-red-400 transition-colors"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[{ label: 'Total calls (30d)', value: '42,318', change: '+22%', icon: Phone }, { label: 'Unique callers', value: '18,940', change: '+14%', icon: Users }, { label: 'Conversion', value: '34.6%', change: '+5.2%', icon: TrendingUp }, { label: 'Avg duration', value: '3m 24s', change: '-12s', icon: Clock }].map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="glass rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4"><s.icon size={20} className="text-purple-400" /><span className="text-xs text-emerald-400 bg-emerald-500/20 px-2 py-1 rounded-full">{s.change}</span></div>
                <div className="text-3xl font-bold text-white mb-1">{s.value}</div>
                <div className="text-sm text-zinc-500">{s.label}</div>
              </motion.div>
            ))}
          </div>
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-xs text-zinc-500 font-medium tracking-wider">CALL LOGS ({total})</h4>
              <button className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-sm text-white transition-all"><Download size={16} />Export CSV</button>
            </div>
            <table className="w-full">
              <thead><tr className="text-xs text-zinc-500 border-b border-white/10">
                <th className="text-left px-4 py-3 font-medium">AGENT</th>
                <th className="text-left px-4 py-3 font-medium">CALLER</th>
                <th className="text-left px-4 py-3 font-medium">DURATION</th>
                <th className="text-left px-4 py-3 font-medium">STATUS</th>
                <th className="text-left px-4 py-3 font-medium">SENTIMENT</th>
                <th className="text-left px-4 py-3 font-medium">TIME</th>
              </tr></thead>
              <tbody>
                {callLogsLoading ? (
                  <tr className="border-b border-white/5">
                    <td colSpan={6} className="px-4 py-6 text-sm text-zinc-500">Loading call logs...</td>
                  </tr>
                ) : callLogs.map((log) => (
                  <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-4 text-sm text-white">{log.agent ?? log.topic ?? `Call #${log.id}`}</td>
                    <td className="px-4 py-4 text-sm text-zinc-400">{log.caller ?? '—'}</td>
                    <td className="px-4 py-4 text-sm text-white">{Math.floor(log.duration / 60)}m {log.duration % 60}s</td>
                    <td className="px-4 py-4"><span className={`text-xs px-2 py-1 rounded-full ${log.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{log.status}</span></td>
                    <td className="px-4 py-4"><span className={`text-xs px-2 py-1 rounded-full ${log.sentiment === 'Positive' || log.sentiment === 'positive' ? 'bg-emerald-500/20 text-emerald-400' : log.sentiment === 'Neutral' || log.sentiment === 'neutral' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>{log.sentiment ?? '—'}</span></td>
                    <td className="px-4 py-4 text-sm text-zinc-500">{log.created_at ? (() => { const diff = Date.now() - new Date(log.created_at).getTime(); const mins = Math.floor(diff / 60000); if (mins < 60) return `${Math.max(mins, 0)}m ago`; const hrs = Math.floor(mins / 60); if (hrs < 24) return `${hrs}h ago`; return `${Math.floor(hrs / 24)}d ago` })() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'telephony' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div><h3 className="text-xl font-semibold text-white">Phone Numbers</h3><p className="text-zinc-400 text-sm">Manage Twilio phone numbers assigned to each agent</p></div>
            <button className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-full text-sm transition-all"><Plus size={16} />Buy Number</button>
          </div>
          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead><tr className="text-xs text-zinc-500 border-b border-white/10">
                <th className="text-left px-6 py-3 font-medium">PHONE NUMBER</th>
                <th className="text-left px-6 py-3 font-medium">ASSIGNED AGENT</th>
                <th className="text-left px-6 py-3 font-medium">STATUS</th>
                <th className="text-left px-6 py-3 font-medium">TOTAL CALLS</th>
                <th className="text-left px-6 py-3 font-medium">ACTIONS</th>
              </tr></thead>
              <tbody>
                {phoneNumbers.map((p, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 text-sm text-white flex items-center gap-2"><Phone size={16} className="text-purple-400" />{p.number}</td>
                    <td className="px-6 py-4 text-sm text-zinc-300">{p.agent}</td>
                    <td className="px-6 py-4"><span className={`text-xs px-2.5 py-1 rounded-full ${p.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-500/20 text-zinc-400'}`}>{p.status}</span></td>
                    <td className="px-6 py-4 text-sm text-white">{p.calls.toLocaleString()}</td>
                    <td className="px-6 py-4 flex gap-2"><button className="text-zinc-400 hover:text-white"><Settings size={16} /></button><button className="text-zinc-400 hover:text-red-400"><Trash2 size={16} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="glass rounded-2xl p-6">
            <h4 className="font-medium text-white mb-4">Twilio Integration</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-4"><p className="text-xs text-zinc-500 mb-1">ACCOUNT SID</p><p className="text-sm text-white font-mono">SKec05e260...3dc58</p></div>
              <div className="bg-white/5 rounded-xl p-4"><p className="text-xs text-zinc-500 mb-1">AUTH TOKEN</p><p className="text-sm text-white font-mono">••••••••dc58</p></div>
            </div>
            <p className="text-sm text-zinc-400 mt-4">Configure your Twilio credentials in the backend .env file to enable real phone calls.</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const handleLogout = () => { logout(); toast.success('Signed out successfully'); navigate('/') }
  const navItems = [
    { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/admin/voice-agents', label: 'Voice Agents', icon: Phone },
    { path: '/admin/studio', label: 'Admin Studio', icon: Settings },
  ]
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex">
      <aside className="w-64 border-r border-white/10 flex flex-col">
        <div className="p-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center"><span className="text-white font-bold text-sm">A</span></div>
            <span className="font-bold text-white">ADhoc<span className="text-purple-400">.ai</span></span>
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link key={item.path} to={item.path}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${location.pathname === item.path ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon size={18} />{item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="glass rounded-xl p-4 mb-4">
            <p className="text-xs text-zinc-500 mb-1">SIGNED IN</p>
            <p className="text-sm text-white truncate">{user?.email}</p>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-400 hover:text-white transition-colors w-full">
            <LogOut size={18} />Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col">
        <header className="h-16 border-b border-white/10 flex items-center justify-between px-6">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search agents, calls, students..."
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-all" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-400 hover:text-white transition-all relative">
              <Bell size={18} /><span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-500" />
            </button>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">{user?.avatar || 'A'}</div>
          </div>
        </header>
        <div className="flex-1 p-6 overflow-auto">
          <Routes>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/voice-agents" element={<VoiceAgentsPage />} />
            <Route path="/studio" element={<AdminStudioPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}