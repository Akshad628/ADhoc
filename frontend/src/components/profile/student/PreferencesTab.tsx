import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings, Save, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers } })
}

interface Prefs {
  target_colleges: string[]
  preferred_courses: string[]
  preferred_locations: string[]
  career_interests: string[]
  notification_email: boolean
  notification_sms: boolean
  notification_app: boolean
}

const CAREER_OPTS = ['Software Engineering','Data Science','AI/ML Research','DevOps/Cloud','Product Management','UI/UX Design','Cybersecurity','Finance/Banking','Civil Services','Teaching/Research','Entrepreneurship','Healthcare IT']
const LOCATIONS = ['Andhra Pradesh','Telangana','Karnataka','Tamil Nadu','Maharashtra','Delhi NCR','Gujarat','Pune','Hyderabad','Bengaluru','Chennai','Mumbai']

function ArrayField({ label, items, onAdd, onRemove, placeholder }: {
  label: string; items: string[]; onAdd: (v: string) => void; onRemove: (v: string) => void; placeholder: string
}) {
  const [input, setInput] = useState('')
  return (
    <div>
      <label className="block text-zinc-400 text-xs font-medium mb-2">{label}</label>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {items.map(item => (
          <span key={item} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/10 text-purple-400 border border-purple-500/20">
            {item}
            <button onClick={() => onRemove(item)}><X className="w-3 h-3 opacity-60 hover:opacity-100" /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && input.trim()) { onAdd(input.trim()); setInput('') } }}
          placeholder={placeholder}
          className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 transition-all" />
        <button onClick={() => { if (input.trim()) { onAdd(input.trim()); setInput('') } }}
          className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

export default function PreferencesTab() {
  const [prefs, setPrefs] = useState<Prefs>({
    target_colleges: [], preferred_courses: [], preferred_locations: [], career_interests: [],
    notification_email: true, notification_sms: false, notification_app: true
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiFetch('/api/student/preferences').then(r => r.json()).then(d => {
      if (d && Object.keys(d).length) {
        setPrefs({
          target_colleges: d.target_colleges || [],
          preferred_courses: d.preferred_courses || [],
          preferred_locations: d.preferred_locations || [],
          career_interests: d.career_interests || [],
          notification_email: d.notification_email ?? true,
          notification_sms: d.notification_sms ?? false,
          notification_app: d.notification_app ?? true,
        })
      }
    }).catch(() => {})
  }, [])

  const addTo = (k: keyof Prefs, v: string) => setPrefs(p => ({ ...p, [k]: [...(p[k] as string[]).filter(x => x !== v), v] }))
  const removeFrom = (k: keyof Prefs, v: string) => setPrefs(p => ({ ...p, [k]: (p[k] as string[]).filter(x => x !== v) }))
  const toggleCareer = (v: string) => prefs.career_interests.includes(v) ? removeFrom('career_interests', v) : addTo('career_interests', v)

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/preferences', { method: 'PUT', body: JSON.stringify(prefs) })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Preferences saved!')
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : 'Failed') }
    finally { setSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Preferences</h2>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Preferences'}
        </button>
      </div>

      {/* Career interests grid */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-3">Career Interests</h3>
        <div className="flex flex-wrap gap-2">
          {CAREER_OPTS.map(opt => (
            <button key={opt} onClick={() => toggleCareer(opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${prefs.career_interests.includes(opt) ? 'bg-purple-600 border-purple-600 text-white' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}>
              {opt}
            </button>
          ))}
        </div>
      </div>

      {/* Location preferences */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-3">Preferred Locations</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {LOCATIONS.map(loc => (
            <button key={loc} onClick={() => prefs.preferred_locations.includes(loc) ? removeFrom('preferred_locations', loc) : addTo('preferred_locations', loc)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                ${prefs.preferred_locations.includes(loc) ? 'bg-cyan-600/20 border-cyan-500 text-cyan-400' : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'}`}>
              {loc}
            </button>
          ))}
        </div>
        <ArrayField label="Other Locations" items={prefs.preferred_locations.filter(l => !LOCATIONS.includes(l))}
          onAdd={v => addTo('preferred_locations', v)} onRemove={v => removeFrom('preferred_locations', v)}
          placeholder="Add other location..." />
      </div>

      {/* Target colleges & preferred courses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-5">
          <ArrayField label="Target Colleges / Universities" items={prefs.target_colleges}
            onAdd={v => addTo('target_colleges', v)} onRemove={v => removeFrom('target_colleges', v)}
            placeholder="e.g. IIT Hyderabad, NIT Warangal" />
        </div>
        <div className="glass rounded-2xl p-5">
          <ArrayField label="Preferred Courses / Programs" items={prefs.preferred_courses}
            onAdd={v => addTo('preferred_courses', v)} onRemove={v => removeFrom('preferred_courses', v)}
            placeholder="e.g. M.Tech CSE, MBA" />
        </div>
      </div>

      {/* Notification preferences */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4">Notification Preferences</h3>
        <div className="space-y-3">
          {[
            { key: 'notification_email', label: 'Email Notifications', desc: 'Receive updates to your registered email' },
            { key: 'notification_sms',   label: 'SMS Notifications',   desc: 'Receive SMS alerts for important events' },
            { key: 'notification_app',   label: 'In-App Notifications', desc: 'Show notification bell in dashboard' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between">
              <div>
                <p className="text-white text-sm font-medium">{label}</p>
                <p className="text-zinc-500 text-xs">{desc}</p>
              </div>
              <button onClick={() => setPrefs(p => ({ ...p, [key]: !p[key as keyof Prefs] }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${prefs[key as keyof Prefs] ? 'bg-purple-600' : 'bg-white/10'}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${prefs[key as keyof Prefs] ? 'left-6' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
