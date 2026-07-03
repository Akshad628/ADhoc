import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, Plus, Trash2, Edit, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { StudentAchievement, CreateAchievementRequest } from '../../../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } })
}

const ACH_CATEGORIES = ['Academic Excellence','Hackathon','Research','Sports','Cultural','Social Work','Leadership','Other']
const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'
const catColors: Record<string, string> = {
  'Academic Excellence': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Hackathon': 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  'Research': 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  'Sports': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Cultural': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Social Work': 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  'Leadership': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Other': 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
}
const EMPTY: CreateAchievementRequest = { achievement_title: '', achievement_type: 'Other', description: '', achievement_date: '' }

interface AchievementsTabProps {
  achievements: StudentAchievement[]
  onRefresh: () => void
}

export default function AchievementsTab({ achievements, onRefresh }: AchievementsTabProps) {
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateAchievementRequest>(EMPTY)
  const [saving, setSaving] = useState(false)

  const set = (k: keyof CreateAchievementRequest, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.achievement_title || !form.achievement_type) { toast.error('Title and Category are required'); return }
    setSaving(true)
    try {
      const endpoint = editId ? `/api/student/achievements/${editId}` : '/api/student/achievements'
      const method = editId ? 'PUT' : 'POST'
      const res = await apiFetch(endpoint, { method, body: JSON.stringify(form) })
      if (!res.ok) throw new Error(await res.text())
      toast.success(editId ? 'Updated!' : 'Achievement added!')
      setShowForm(false); setEditId(null); setForm(EMPTY); onRefresh()
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  const openEdit = (a: StudentAchievement) => {
    setEditId(a.id)
    setForm({ achievement_title: a.achievement_title, achievement_type: a.achievement_type || '', description: a.description || '', achievement_date: a.achievement_date?.split('T')[0] || '' })
    setShowForm(true)
  }

  const handleDelete = async (id: string, achievement_title: string) => {
    if (!confirm(`Delete "${achievement_title}"?`)) return
    try {
      const res = await apiFetch(`/api/student/achievements/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      toast.success('Achievement removed')
      onRefresh()
    } catch { toast.error('Failed to delete') }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Achievements ({achievements.length})</h2>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Achievement'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Title *</label>
                <input className={INPUT_CLASS} value={form.achievement_title} onChange={e => set('achievement_title', e.target.value)} placeholder="e.g. 1st Place Smart India Hackathon" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Category *</label>
                <select className={INPUT_CLASS} value={form.achievement_type} onChange={e => set('achievement_type', e.target.value)}>
                  {ACH_CATEGORIES.map(c => <option key={c} value={c} className="bg-[#1a1a2e]">{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Date</label>
                <input type="date" className={INPUT_CLASS} value={form.achievement_date} onChange={e => set('achievement_date', e.target.value)} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Description</label>
                <textarea className={`${INPUT_CLASS} resize-none`} rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe your achievement..." />
              </div>
            </div>
            <button onClick={handleSubmit} disabled={saving}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : editId ? 'Update' : 'Add'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {achievements.length === 0 ? (
        <div className="text-center py-12 text-zinc-600">
          <Trophy className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No achievements added yet</p>
          <button onClick={() => setShowForm(true)} className="mt-2 text-purple-400 text-sm hover:text-purple-300">Add your first achievement →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {achievements.map((ach, i) => (
            <motion.div key={ach.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  {ach.achievement_type && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border ${catColors[ach.achievement_type] || catColors['Other']}`}>{ach.achievement_type}</span>
                  )}
                  <h3 className="text-white font-semibold text-sm mt-2">{ach.achievement_title}</h3>
                  {ach.achievement_date && <p className="text-zinc-500 text-xs mt-0.5">{new Date(ach.achievement_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                  {ach.description && <p className="text-zinc-400 text-xs mt-1.5 leading-relaxed">{ach.description}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <button onClick={() => openEdit(ach)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white"><Edit className="w-3 h-3" /></button>
                  <button onClick={() => handleDelete(ach.id, ach.achievement_title ?? ach.achievement_title ?? '')} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
