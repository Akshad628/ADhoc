import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Code2, Github, Linkedin, Globe, Save, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStudentSkills } from '../../../hooks/useStudentSkills'
import SkeletonCard from '../shared/SkeletonCard'

const SKILL_SECTIONS = [
  { key: 'programming_langs',  label: 'Programming Languages', placeholder: 'e.g. Python, Java, C++', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { key: 'frameworks',         label: 'Frameworks & Libraries',placeholder: 'e.g. React, FastAPI, TensorFlow', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { key: 'databases',          label: 'Databases',             placeholder: 'e.g. PostgreSQL, MongoDB, Redis', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { key: 'cloud_technologies', label: 'Cloud & DevOps',        placeholder: 'e.g. AWS, Docker, Kubernetes', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  { key: 'ai_ml_skills',       label: 'AI / ML Skills',        placeholder: 'e.g. NLP, Computer Vision, LLMs', color: 'bg-pink-500/10 text-pink-400 border-pink-500/20' },
  { key: 'tools',              label: 'Tools & Platforms',     placeholder: 'e.g. Git, Figma, Postman, JIRA', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  { key: 'soft_skills',        label: 'Soft Skills',           placeholder: 'e.g. Leadership, Communication', color: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  { key: 'languages_known',    label: 'Languages Known',       placeholder: 'e.g. English, Telugu, Hindi', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
]

function SkillTag({ label, color, onRemove }: { label: string; color: string; onRemove?: () => void }) {
  return (
    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${color}`}>
      {label}
      {onRemove && (
        <button onClick={onRemove} className="opacity-60 hover:opacity-100 transition-opacity">
          <X className="w-3 h-3" />
        </button>
      )}
    </motion.span>
  )
}

function SkillInput({ sectionKey, color, skills, onChange, placeholder }: {
  sectionKey: string; color: string; skills: string[]; onChange: (k: string, v: string[]) => void; placeholder: string
}) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (v && !skills.includes(v)) onChange(sectionKey, [...skills, v])
    setInput('')
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {skills.map(s => (
          <SkillTag key={s} label={s} color={color}
            onRemove={() => onChange(sectionKey, skills.filter(x => x !== s))} />
        ))}
      </div>
      <div className="flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder={placeholder}
          className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 transition-all" />
        <button onClick={add} className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function SkillsTab() {
  const { skills, loading, saving, updateSkills } = useStudentSkills()
  const [form, setForm] = useState<Record<string, string[]>>({})
  const [links, setLinks] = useState({ github_url: '', linkedin_url: '', portfolio_url: '' })

  useEffect(() => {
    if (skills) {
      setForm({
        programming_langs: skills.programming_langs || [],
        frameworks: skills.frameworks || [],
        databases: skills.databases || [],
        cloud_technologies: skills.cloud_technologies || [],
        ai_ml_skills: skills.ai_ml_skills || [],
        tools: skills.tools || [],
        soft_skills: skills.soft_skills || [],
        languages_known: skills.languages_known || [],
      })
      setLinks({ github_url: skills.github_url || '', linkedin_url: skills.linkedin_url || '', portfolio_url: skills.portfolio_url || '' })
    }
  }, [skills])

  const handleSave = async () => {
    const result = await updateSkills({ ...form, ...links })
    if (result.success) toast.success('Skills saved!')
    else toast.error(result.error || 'Save failed')
  }

  if (loading) return <SkeletonCard rows={6} height={200} />

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Skills & Links</h2>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Skills'}
        </button>
      </div>

      {/* Profile links */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />Profile Links
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { key: 'github_url',    icon: Github,   label: 'GitHub URL',    placeholder: 'https://github.com/username' },
            { key: 'linkedin_url',  icon: Linkedin, label: 'LinkedIn URL',  placeholder: 'https://linkedin.com/in/username' },
            { key: 'portfolio_url', icon: Globe,    label: 'Portfolio URL', placeholder: 'https://yourportfolio.com' },
          ].map(({ key, icon: Icon, label, placeholder }) => (
            <div key={key}>
              <label className="block text-zinc-400 text-xs font-medium mb-1.5 flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5" />{label}
              </label>
              <input type="url" className={INPUT_CLASS} value={links[key as keyof typeof links]}
                onChange={e => setLinks(l => ({ ...l, [key]: e.target.value }))} placeholder={placeholder} />
            </div>
          ))}
        </div>
      </div>

      {/* Skill categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SKILL_SECTIONS.map(({ key, label, placeholder, color }) => (
          <div key={key} className="glass rounded-2xl p-4">
            <h4 className="text-white text-sm font-medium mb-3 flex items-center gap-2">
              <Code2 className={`w-3.5 h-3.5 ${color.split(' ')[1]}`} />
              {label}
            </h4>
            <SkillInput sectionKey={key} color={color} skills={form[key] || []}
              onChange={(k, v) => setForm(f => ({ ...f, [k]: v }))} placeholder={placeholder} />
          </div>
        ))}
      </div>
    </motion.div>
  )
}
