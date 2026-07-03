import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LayoutDashboard, Phone, BookOpen, LogOut, Search, Bell, Users, GraduationCap, Clock, CheckCircle, Mic, PhoneCall, Settings, Calendar, Award } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCalls } from '../hooks/useCalls'
import { apiFetch } from '../hooks/useApi'
import CallConsolePage from './admin/CallConsolePage'
import MeetingsPage from './MeetingsPage'
import AdminScholarshipsPage from './admin/AdminScholarshipsPage'
import toast from 'react-hot-toast'

function DashboardHome() {
  const [dashboardData, setDashboardData] = useState<any>(null)
  const [tableData, setTableData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
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

  const loadModalData = async (type: string) => {
    try {
      setLoading(true)

      const token = localStorage.getItem('token')

      const response = await fetch(
        `http://localhost:8000/api/dashboard/${type}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      )

      const data = await response.json()

      console.log('MODAL DATA:', data)

      setTableData(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
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
      label: 'Faculty',
      value: dashboardData?.stats?.faculty ?? 0,
      icon: GraduationCap,
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

  const activities: any[] = dashboardData?.activities ?? []

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

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
             onClick={() => {
                setModalTitle(stat.label)

                if (stat.label === 'Students') {
                  loadModalData('students')
                }

                if (stat.label === 'Faculty') {
                  loadModalData('faculty-list')
                }

                if (stat.label === 'Active calls today') {
                  loadModalData('calls')
                }

                if (stat.label === 'Active sessions') {
                  loadModalData('sessions')
                }

                setShowModal(true)
              }}
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
                      {a.event_data?.title ?? 'Untitled'}
                    </span>

                    {' — '}

                    <span className="text-zinc-400">
                      {a.event_data?.description ?? ''}
                    </span>
                </p>
              </div>

              <span className="text-xs text-zinc-500 flex-shrink-0">
                {a.created_at ? new Date(a.created_at).toLocaleString() : a.time}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-md z-50 flex items-center justify-center"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-[700px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">
                {modalTitle}
              </h2>

              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1 bg-zinc-800 rounded"
              >
                Close
              </button>
            </div>
            

            <div className="overflow-auto max-h-[500px]">
              {loading ? (
                <p className="text-zinc-400">Loading...</p>
              ) : (
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      {tableData.length > 0 &&
                        Object.keys(tableData[0]).map((key) => (
                          <th
                            key={key}
                            className="p-3 text-white font-semibold"
                          >
                            {key}
                          </th>
                        ))}
                    </tr>
                  </thead>

                  <tbody>
                    {tableData.map((row, index) => (
                      <tr
                        key={index}
                        className="border-b border-zinc-800"
                      >
                        {Object.values(row).map((value: any, i) => (
                          <td
                            key={i}
                            className="p-3 text-zinc-300"
                          >
                            {typeof value === 'object'
                              ? JSON.stringify(value)
                              : String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function VoiceAgentsPage() {
  const navigate = useNavigate()

  const [promptText, setPromptText] = useState('')
  const [showAgentModal, setShowAgentModal] = useState(false)

  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(0)
  const [isListening, setIsListening] = useState(false)

  useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch(
        'http://localhost:8000/api/agents',
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const data = await response.json()

      setAgents(data)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }
  const savePrompt = async () => {
    try {
      const token = localStorage.getItem('token')

      const response = await fetch(
        `http://localhost:8000/api/agents/${agents[selectedAgent].id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            system_prompt: promptText,
          }),
        }
      )

      const data = await response.json()

      console.log("API Response:", data)
      console.log("Status:", response.status)

      toast.success('Prompt updated successfully')

      loadAgents()

      setShowAgentModal(false)
    } catch (error) {
      console.error(error)

      toast.error('Failed to update prompt')
    }
  }
  
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

  if (loading) {
    return (
      <div className="text-white p-6">
        Loading agents...
      </div>
    )
  }

  if (agents.length === 0) {
    return (
      <div className="text-white p-6">
        No agents found.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white mb-1">Voice Agents</h1>
          <p className="text-zinc-400">Talk to your AI workforce. Live calls, transcripts and analytics — all in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/admin/call-console')}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-purple-950/30 transition-all hover:bg-purple-500"
        >
          <PhoneCall size={16} />
          Make Calls
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 space-y-3">
          <p className="text-xs text-zinc-500 font-medium tracking-wider mb-2">PICK AN AGENT</p>
          {agents.map((agent, i) => (
            <motion.button key={agent.name} whileHover={{ x: 4 }} 
            onClick={() => {
              setSelectedAgent(i)
              setPromptText(agent.system_prompt || '')
              setShowAgentModal(true)
            }}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all text-left ${selectedAgent === i ? 'bg-purple-500/20 border border-purple-500/30' : 'glass hover:bg-white/10 border border-white/5'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedAgent === i ? 'bg-purple-500/30' : 'bg-white/5'}`}>
                <GraduationCap
                  size={20}
                  className={selectedAgent === i ? 'text-purple-400' : 'text-zinc-400'}
                />
              </div>
              <div className="flex-1">
                <p className={`font-medium ${selectedAgent === i ? 'text-white' : 'text-zinc-300'}`}>{agent.name}</p>
                <p className="text-xs text-zinc-500">{agent.system_prompt?.substring(0, 60)}...</p>
                <p className="text-xs text-purple-400 mt-1">{agent.phone_number}</p>
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
                  <h3 className="font-semibold text-white text-lg">{agents[selectedAgent]?.name}</h3>
                  <p className="text-sm text-zinc-400">{agents[selectedAgent]?.system_prompt}</p>
                  <p className="text-xs text-purple-400 mt-1">{agents[selectedAgent]?.phone_number}</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs bg-zinc-500/20 text-zinc-400">{agents[selectedAgent]?.is_active ? 'Active' : 'Inactive'}</span>
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
      {showAgentModal && (
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center"
        onClick={() => setShowAgentModal(false)}
      >
        <div
          className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-[900px] max-w-[95vw]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-white">
              {agents[selectedAgent]?.name}
            </h2>

            <button
              onClick={() => setShowAgentModal(false)}
              className="px-4 py-2 bg-zinc-800 rounded-lg text-white"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-sm">
                Phone Number
              </label>

              <input
                type="text"
                value={agents[selectedAgent]?.phone_number || ''}
                readOnly
                className="w-full mt-1 p-3 rounded-xl bg-zinc-800 text-white"
              />
            </div>

            <div>
              <label className="text-zinc-400 text-sm">
                System Prompt
              </label>

              <textarea
                rows={10}
                value={promptText}
                onChange={(e) => {
                console.log("NEW PROMPT:", e.target.value)
                setPromptText(e.target.value)
              }}
              className="w-full mt-1 p-3 rounded-xl bg-zinc-800 text-white"
              />
            </div>

            <button
              onClick={savePrompt}
              className="px-5 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl text-white"
            >
              Save Prompt
            </button>
          </div>
        </div>
      </div>
    )}
    </div>
  )
}

type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags?: string[];
  created_at?: string;
  updated_at?: string;
  created_by?: number;
}

function KnowledgeBasePage() {
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: 'general',
    tags: ''
  })

  const fetchItems = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/knowledge')
      setItems(data || [])
    } catch (error) {
      console.error('Failed to load knowledge base', error)
      toast.error('Unable to load knowledge base')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchItems() }, [])

  const resetForm = () => {
    setSelectedId(null)
    setForm({ title: '', content: '', category: 'general', tags: '' })
  }

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      toast.error('Title and content are required')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
      }

      if (selectedId) {
        await apiFetch(`/api/knowledge/${selectedId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
        toast.success('Knowledge item updated')
      } else {
        await apiFetch('/api/knowledge', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        toast.success('Knowledge item created')
      }

      resetForm()
      fetchItems()
    } catch (error) {
      console.error(error)
      toast.error('Failed to save knowledge item')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (item: KnowledgeItem) => {
    setSelectedId(item.id)
    setForm({
      title: item.title,
      content: item.content,
      category: item.category,
      tags: item.tags?.join(', ') || ''
    })
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this knowledge item?')) {
      return
    }
    try {
      await apiFetch(`/api/knowledge/${id}`, { method: 'DELETE' })
      toast.success('Knowledge item deleted')
      if (selectedId === id) resetForm()
      fetchItems()
    } catch (error) {
      console.error(error)
      toast.error('Failed to delete item')
    }
  }

  const filteredItems = items.filter((item) => {
    const query = search.toLowerCase()
    return (
      item.title.toLowerCase().includes(query) ||
      item.category.toLowerCase().includes(query) ||
      item.content.toLowerCase().includes(query) ||
      (item.tags || []).join(' ').toLowerCase().includes(query)
    )
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Knowledge Base</h1>
        <p className="text-zinc-400">Create, edit, and manage structured content used by your AI agents.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="glass rounded-2xl p-6 xl:col-span-1">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Knowledge item</h2>
              <p className="text-sm text-zinc-500">Add or update a knowledge entry.</p>
            </div>
            <button type="button" onClick={resetForm} className="text-sm text-purple-400 hover:text-purple-300">Clear</button>
          </div>

          <div className="space-y-4">
            <label className="block text-sm text-zinc-400">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <label className="block text-sm text-zinc-400">Category</label>
            <input
              value={form.category}
              onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <label className="block text-sm text-zinc-400">Tags (comma separated)</label>
            <input
              value={form.tags}
              onChange={(e) => setForm((prev) => ({ ...prev, tags: e.target.value }))}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <label className="block text-sm text-zinc-400">Content</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
              rows={10}
              className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />

            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="w-full rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {selectedId ? 'Update item' : 'Create item'}
            </button>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-4">
          <div className="glass rounded-2xl p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Knowledge listings</h2>
              <p className="text-sm text-zinc-500">Search and edit current knowledge entries.</p>
            </div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search knowledge..."
              className="min-w-[240px] rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50"
            />
          </div>

          <div className="glass rounded-2xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-zinc-500">
                  <th className="px-4 py-3">Title</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Tags</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">Loading knowledge base...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">No items found.</td></tr>
                ) : filteredItems.map((item) => (
                  <tr key={item.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-4 text-white">{item.title}</td>
                    <td className="px-4 py-4 text-zinc-400">{item.category}</td>
                    <td className="px-4 py-4 text-zinc-400">{item.tags?.join(', ')}</td>
                    <td className="px-4 py-4 text-zinc-400">{item.updated_at ? new Date(item.updated_at).toLocaleDateString() : item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}</td>
                    <td className="px-4 py-4 text-zinc-400 flex gap-2">
                      <button type="button" onClick={() => handleEdit(item)} className="text-purple-400 hover:text-purple-200">Edit</button>
                      <button type="button" onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-200">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}


function TelephonyPage() {
  const navigate = useNavigate()
  const [agents, setAgents] = useState<any[]>([])
  const [calls, setCalls] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    try {
      const [agentsData, callsData] = await Promise.all([
        apiFetch('/api/agents'),
        apiFetch('/api/calls')
      ])
      setAgents(agentsData || [])
      setCalls(callsData || [])
    } catch (error) {
      console.error('Failed to load telephony data', error)
      toast.error('Unable to load telephony details')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const totalCalls = calls.length
  const activeAgents = agents.filter((agent) => agent.is_active).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-1">Telephony</h1>
        <p className="text-zinc-400">Monitor voice agents, number assignments, and call volume in real time.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-zinc-500">Voice agents</p>
          <p className="text-3xl font-semibold text-white mt-2">{agents.length}</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-zinc-500">Active agents</p>
          <p className="text-3xl font-semibold text-white mt-2">{activeAgents}</p>
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-zinc-500">Total calls</p>
          <p className="text-3xl font-semibold text-white mt-2">{totalCalls}</p>
        </div>
      </div>

      <div className="glass rounded-2xl p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-white">Agent roster</h2>
            <p className="text-sm text-zinc-500">Connected AI agents and assigned voice settings.</p>
          </div>
          <button onClick={() => navigate('/admin/voice-agents')} className="inline-flex items-center gap-2 rounded-full bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 transition-all">
            <PhoneCall size={16} /> Manage agents
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-zinc-500">
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Voice</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Call count</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">Loading telephony data...</td></tr>
              ) : agents.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-zinc-500">No agents configured.</td></tr>
              ) : agents.map((agent) => {
                const count = calls.filter((call) => call.agent === agent.name).length
                const voice = agent.voice_settings?.[0]
                return (
                  <tr key={agent.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-4 text-white">{agent.name}</td>
                    <td className="px-4 py-4 text-zinc-400">{agent.phone_number ?? '—'}</td>
                    <td className="px-4 py-4 text-zinc-400">{voice ? `${voice.provider} / ${voice.voice_id || voice.model}` : 'Unconfigured'}</td>
                    <td className="px-4 py-4"><span className={`text-xs px-2 py-1 rounded-full ${agent.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-500/20 text-zinc-400'}`}>{agent.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="px-4 py-4 text-white">{count}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
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
    { path: '/admin/knowledge', label: 'Knowledge Base', icon: BookOpen },
    { path: '/admin/telephony', label: 'Telephony', icon: Phone },
    { path: '/admin/meetings', label: 'Meetings', icon: Calendar },
    { path: '/admin/scholarships', label: 'Scholarships', icon: Award },
  ]
  return (
    <div className="min-h-screen bg-transparent flex">
      <aside className="w-64 border-r border-white/10 flex flex-col backdrop-blur-xl bg-black/30">
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
            <Route path="/knowledge" element={<KnowledgeBasePage />} />

             <Route path="/telephony" element={<TelephonyPage />} />
            <Route path="/voice-agents" element={<VoiceAgentsPage />} />
            <Route path="/call-console" element={<CallConsolePage />} />
            <Route path="/meetings/*" element={<MeetingsPage />} />
            <Route path="/scholarships/*" element={<AdminScholarshipsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
