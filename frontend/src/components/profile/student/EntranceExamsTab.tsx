import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ClipboardList, Plus, Trash2, Edit, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { EntranceExam, CreateEntranceExamRequest } from '../../../types/profile.types'
import { useStudentExams } from '../../../hooks/useStudentExams'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'

const EXAM_LIST = ['EAMCET','JEE_MAIN','JEE_ADVANCED','NEET','CUET','GATE','CAT','GRE','IELTS','TOEFL','Other']

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'
const EMPTY: CreateEntranceExamRequest = { exam_name: 'EAMCET', exam_year: undefined, score: undefined, rank: undefined, percentile: undefined }

const examColors: Record<string, string> = {
  EAMCET: 'text-emerald-400 bg-emerald-500/10', JEE_MAIN: 'text-blue-400 bg-blue-500/10',
  JEE_ADVANCED: 'text-indigo-400 bg-indigo-500/10', NEET: 'text-pink-400 bg-pink-500/10',
  GATE: 'text-amber-400 bg-amber-500/10', CAT: 'text-orange-400 bg-orange-500/10',
  GRE: 'text-cyan-400 bg-cyan-500/10', IELTS: 'text-purple-400 bg-purple-500/10',
  CUET: 'text-teal-400 bg-teal-500/10', TOEFL: 'text-rose-400 bg-rose-500/10',
}

export default function EntranceExamsTab() {
  const { exams, loading, saving, addExam, updateExam, deleteExam } = useStudentExams()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<CreateEntranceExamRequest>(EMPTY)

  const set = (k: keyof CreateEntranceExamRequest, v: string) =>
    setForm(f => ({ ...f, [k]: ['exam_year','score','rank','percentile'].includes(k) ? (v ? Number(v) : undefined) : v }))

  const handleSubmit = async () => {
    if (!form.exam_name || !form.exam_year) { toast.error('Exam name and year are required'); return }
    const result = editId ? await updateExam(editId, form) : await addExam(form)
    if (result.success) { toast.success(editId ? 'Exam updated!' : 'Exam added!'); setShowForm(false); setEditId(null); setForm(EMPTY) }
    else toast.error(result.error || 'Failed')
  }

  const openEdit = (exam: EntranceExam) => {
    setEditId(exam.id)
    setForm({ exam_name: exam.exam_name, exam_year: exam.exam_year, score: exam.score, rank: exam.rank, percentile: exam.percentile })
    setShowForm(true)
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name} exam record?`)) return
    const r = await deleteExam(id)
    if (r.success) toast.success('Deleted')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Entrance Exams ({exams.length})</h2>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Result'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Exam *</label>
                <select className={INPUT_CLASS} value={form.exam_name} onChange={e => set('exam_name', e.target.value)}>
                  {EXAM_LIST.map(e => <option key={e} value={e} className="bg-[#1a1a2e]">{e.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              {[
                { k: 'exam_year', l: 'Year *' }, { k: 'score', l: 'Score / Marks' },
                { k: 'rank', l: 'Rank / AIR' }, { k: 'percentile', l: 'Percentile (%)' },
              ].map(({ k, l }) => (
                <div key={k}>
                  <label className="block text-zinc-400 text-xs font-medium mb-1.5">{l}</label>
                  <input type="number" className={INPUT_CLASS} placeholder={l}
                    value={form[k as keyof typeof form] || ''} onChange={e => set(k as keyof CreateEntranceExamRequest, e.target.value)} />
                </div>
              ))}
            </div>
            <button onClick={handleSubmit} disabled={saving}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : editId ? 'Update' : 'Add Exam'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <SkeletonRow count={3} /> : exams.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No exam results yet" description="Add your EAMCET, JEE, GATE, GRE, IELTS and other entrance exam scores"
          action={{ label: 'Add Exam Result', onClick: () => setShowForm(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {exams.map((exam, i) => {
            const color = examColors[exam.exam_name] || 'text-zinc-400 bg-zinc-500/10'
            return (
              <motion.div key={exam.id} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.07 }}
                className="glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors group">
                <div className="flex items-start justify-between">
                  <span className={`px-2.5 py-1 rounded-xl text-xs font-bold ${color}`}>
                    {exam.exam_name.replace(/_/g, ' ')}
                  </span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(exam)} className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                      <Edit className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDelete(exam.id, exam.exam_name)} className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  {exam.exam_year && <p className="text-zinc-500 text-xs">{exam.exam_year}</p>}
                  {exam.score != null && <p className="text-white text-lg font-bold">{exam.score} <span className="text-zinc-500 text-sm font-normal">score</span></p>}
                  {exam.rank != null && <p className="text-cyan-400 text-sm">Rank: <span className="font-bold">{exam.rank.toLocaleString()}</span></p>}
                  {exam.percentile != null && <p className="text-purple-400 text-sm">Percentile: <span className="font-bold">{exam.percentile}%</span></p>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
