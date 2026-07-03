import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Save, ChevronDown, GraduationCap, BookOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import { AcademicRecord, SemesterMark, AcademicLevel, UpsertAcademicRecordRequest, UpsertSemesterMarkRequest } from '../../../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

interface AcademicInfoTabProps {
  records: AcademicRecord[]
  semesters: SemesterMark[]
  onRefresh: () => void
}

const LEVELS: { value: AcademicLevel; label: string }[] = [
  { value: '10th', label: '10th Class / SSC' },
  { value: 'intermediate', label: 'Intermediate / 12th / HSC' },
  { value: 'diploma', label: 'Diploma' },
  { value: 'ug', label: 'Under-Graduate (UG)' },
  { value: 'pg', label: 'Post-Graduate (PG)' },
]

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function AcademicInfoTab({ records, semesters, onRefresh }: AcademicInfoTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [forms, setForms] = useState<Record<string, Partial<UpsertAcademicRecordRequest>>>({})
  const [semForm, setSemForm] = useState<Partial<UpsertSemesterMarkRequest>>({ semester: 1 })
  const [saving, setSaving] = useState(false)
  const [addingSem, setAddingSem] = useState(false)
  const [showSemForm, setShowSemForm] = useState(false)

  const getRecord = (level: AcademicLevel) => records.find(r => r.level === level)

  const setField = (level: string, key: string, val: string) =>
    setForms(f => ({ ...f, [level]: { ...f[level], [key]: val } }))

  const saveRecord = async (level: AcademicLevel) => {
    setSaving(true)
    const existing = getRecord(level)
    const formData = forms[level] || {}
    const data: UpsertAcademicRecordRequest = {
      level,
      institution_name: formData.institution_name || existing?.institution_name,
      board_university: formData.board_university || existing?.board_university,
      degree: formData.degree || existing?.degree,
      branch_stream: formData.branch_stream || existing?.branch_stream,
      hall_ticket: formData.hall_ticket || existing?.hall_ticket,
      year_of_passing: formData.year_of_passing ? Number(formData.year_of_passing) : existing?.year_of_passing,
      percentage: formData.percentage ? Number(formData.percentage) : existing?.percentage,
      cgpa: formData.cgpa ? Number(formData.cgpa) : existing?.cgpa,
    }
    try {
      const res = await apiFetch('/api/student/academic', { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      toast.success(`${level.toUpperCase()} record saved!`)
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Save failed')
    } finally { setSaving(false) }
  }

  const addSemester = async () => {
    if (!semForm.semester) { toast.error('Semester number required'); return }
    setAddingSem(true)
    try {
      const res = await apiFetch('/api/student/semesters', { method: 'POST', body: JSON.stringify(semForm) })
      if (!res.ok) throw new Error(await res.text())
      toast.success(`Semester ${semForm.semester} added!`)
      setSemForm({ semester: 1 })
      setShowSemForm(false)
      onRefresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed')
    } finally { setAddingSem(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-white text-lg font-bold">Academic Information</h2>

      {/* Education levels accordion */}
      <div className="space-y-3">
        {LEVELS.map(({ value, label }) => {
          const rec = getRecord(value)
          const isOpen = expanded === value
          const form = forms[value] || {}

          return (
            <div key={value} className="glass rounded-2xl overflow-hidden">
              <button
                onClick={() => setExpanded(isOpen ? null : value)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center
                    ${rec ? 'bg-emerald-500/10' : 'bg-white/5'}`}>
                    <GraduationCap className={`w-4 h-4 ${rec ? 'text-emerald-400' : 'text-zinc-600'}`} />
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{label}</p>
                    {rec?.institution_name && <p className="text-zinc-500 text-xs">{rec.institution_name}</p>}
                    {rec?.percentage && <p className="text-purple-400 text-xs">{rec.percentage}%</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {rec && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Added</span>}
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
              </button>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                    className="overflow-hidden">
                    <div className="px-5 pb-5 border-t border-white/5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                        {[
                          { key: 'institution_name', label: 'Institution Name' },
                          { key: 'board_university', label: 'Board / University' },
                          { key: 'degree', label: 'Degree / Programme', show: ['ug','pg','diploma'].includes(value) },
                          { key: 'branch_stream', label: 'Branch / Stream' },
                          { key: 'hall_ticket', label: 'Hall Ticket / Roll No.' },
                          { key: 'year_of_passing', label: 'Year of Passing', type: 'number' },
                          { key: 'percentage', label: 'Percentage (%)', type: 'number' },
                          { key: 'cgpa', label: 'CGPA', type: 'number', show: ['ug','pg'].includes(value) },
                        ].filter(f => f.show !== false).map(({ key, label, type = 'text' }) => (
                          <div key={key}>
                            <label className="block text-zinc-400 text-xs font-medium mb-1.5">{label}</label>
                            <input type={type} className={INPUT_CLASS}
                              value={form[key as keyof typeof form] !== undefined ? String(form[key as keyof typeof form]) : String(rec?.[key as keyof AcademicRecord] || '')}
                              onChange={e => setField(value, key, e.target.value)}
                              placeholder={label} />
                          </div>
                        ))}
                      </div>
                      <button onClick={() => saveRecord(value)} disabled={saving}
                        className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
                        <Save className="w-4 h-4" />
                        {saving ? 'Saving...' : `Save ${label}`}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Semester marks */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <h3 className="text-white font-semibold text-sm">Semester Performance</h3>
          </div>
          <button onClick={() => setShowSemForm(!showSemForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium hover:bg-cyan-500/20 transition-colors">
            <Plus className="w-3.5 h-3.5" />Add Semester
          </button>
        </div>

        {showSemForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            className="mb-4 p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[{ k: 'semester', l: 'Semester', type: 'number' }, { k: 'year', l: 'Year', type: 'number' }, { k: 'sgpa', l: 'SGPA', type: 'number' }, { k: 'cgpa', l: 'CGPA', type: 'number' }].map(({ k, l, type }) => (
                <div key={k}>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">{l}</label>
                  <input type={type} className={INPUT_CLASS}
                    value={semForm[k as keyof typeof semForm] || ''}
                    onChange={e => setSemForm(f => ({ ...f, [k]: Number(e.target.value) }))} placeholder={l} />
                </div>
              ))}
            </div>
            <button onClick={addSemester} disabled={addingSem}
              className="mt-3 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {addingSem ? 'Adding...' : 'Add Semester'}
            </button>
          </motion.div>
        )}

        {semesters.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {semesters.map(s => (
              <div key={s.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 text-center">
                <div className="text-zinc-500 text-xs mb-1">Sem {s.semester}</div>
                <div className="text-white font-bold">{s.sgpa || '—'}</div>
                <div className="text-zinc-500 text-xs">SGPA</div>
                {s.cgpa && <div className="text-cyan-400 text-xs mt-1">CGPA: {s.cgpa}</div>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-zinc-600 text-sm text-center py-4">No semester records yet. Add your first semester above.</p>
        )}
      </div>
    </motion.div>
  )
}
