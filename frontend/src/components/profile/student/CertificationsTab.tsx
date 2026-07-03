import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, Plus, Trash2, Edit, ExternalLink, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { StudentCertification, CreateCertificationRequest, CertificationCategory } from '../../../types/profile.types'
import { useStudentCertifications } from '../../../hooks/useStudentCertifications'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'

const CERT_CATEGORIES: CertificationCategory[] = [
  'online_course','hackathon','sports','ncc','nss','workshop','conference','research','patent','volunteering','cultural'
]

const catColors: Record<string, string> = {
  online_course: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  hackathon:     'bg-orange-500/10 text-orange-400 border-orange-500/20',
  sports:        'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  ncc:           'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  nss:           'bg-teal-500/10 text-teal-400 border-teal-500/20',
  workshop:      'bg-purple-500/10 text-purple-400 border-purple-500/20',
  conference:    'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  research:      'bg-pink-500/10 text-pink-400 border-pink-500/20',
  patent:        'bg-amber-500/10 text-amber-400 border-amber-500/20',
  volunteering:  'bg-lime-500/10 text-lime-400 border-lime-500/20',
  cultural:      'bg-rose-500/10 text-rose-400 border-rose-500/20',
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

interface FormState extends CreateCertificationRequest { }
const EMPTY_FORM: FormState = { title: '', issuing_organization: '', category: 'online_course', issue_date: '', expiry_date: '', credential_id: '', credential_url: '' }

export default function CertificationsTab() {
  const { certifications, loading, saving, addCertification, updateCertification, deleteCertification } = useStudentCertifications()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  const set = (k: keyof FormState, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.title || !form.issuing_organization) { toast.error('Title and Issuing Organization are required'); return }
    const result = editId
      ? await updateCertification(editId, form)
      : await addCertification(form)
    if (result.success) {
      toast.success(editId ? 'Certification updated!' : 'Certification added!')
      setShowForm(false); setEditId(null); setForm(EMPTY_FORM)
    } else toast.error(result.error || 'Failed to save')
  }

  const openEdit = (cert: StudentCertification) => {
    setEditId(cert.id)
    setForm({
      title: cert.title, issuing_organization: cert.issuing_organization || '', category: cert.category as CertificationCategory || 'online_course',
      issue_date: cert.issue_date?.split('T')[0] || '', expiry_date: cert.expiry_date?.split('T')[0] || '',
      credential_id: cert.credential_id || '', credential_url: cert.credential_url || ''
    })
    setShowForm(true)
  }

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"?`)) return
    const r = await deleteCertification(id)
    if (r.success) toast.success('Certification removed')
    else toast.error('Failed to delete')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Certifications ({certifications.length})</h2>
        <button onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM) }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'Add Certificate'}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden">
            <h3 className="text-white font-medium mb-4">{editId ? 'Edit Certification' : 'Add Certification'}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Title *</label>
                <input className={INPUT_CLASS} value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. AWS Cloud Practitioner, Smart India Hackathon" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Issuing Organization *</label>
                <input className={INPUT_CLASS} value={form.issuing_organization} onChange={e => set('issuing_organization', e.target.value)} placeholder="e.g. AWS, NPTEL, Google" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Category</label>
                <select className={INPUT_CLASS} value={form.category} onChange={e => set('category', e.target.value)}>
                  {CERT_CATEGORIES.map(c => <option key={c} value={c} className="bg-[#1a1a2e] capitalize">{c.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Issue Date</label>
                <input type="date" className={INPUT_CLASS} value={form.issue_date} onChange={e => set('issue_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Expiry Date</label>
                <input type="date" className={INPUT_CLASS} value={form.expiry_date} onChange={e => set('expiry_date', e.target.value)} />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Credential ID</label>
                <input className={INPUT_CLASS} value={form.credential_id} onChange={e => set('credential_id', e.target.value)} placeholder="Certification ID / Code" />
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Credential URL</label>
                <input type="url" className={INPUT_CLASS} value={form.credential_url} onChange={e => set('credential_url', e.target.value)} placeholder="https://..." />
              </div>
            </div>
            <button onClick={handleSubmit} disabled={saving}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              <Save className="w-4 h-4" />{saving ? 'Saving...' : editId ? 'Update' : 'Add Certification'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? <SkeletonRow count={4} /> : certifications.length === 0 ? (
        <EmptyState icon={Award} title="No certifications yet" description="Add your course completions, hackathons, NSS, NCC, sports achievements and more"
          action={{ label: 'Add Certification', onClick: () => setShowForm(true) }} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {certifications.map((cert, i) => (
            <motion.div key={cert.id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              className="glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors group">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {cert.category && (
                      <span className={`text-xs px-2 py-0.5 rounded-full border capitalize ${catColors[cert.category] || 'bg-white/5 text-zinc-400 border-white/10'}`}>
                        {cert.category.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  <h3 className="text-white font-semibold text-sm leading-snug">{cert.title}</h3>
                  {cert.issuing_organization && <p className="text-zinc-500 text-xs mt-0.5">{cert.issuing_organization}</p>}
                  {cert.issue_date && (
                    <p className="text-zinc-600 text-xs mt-1">
                      {new Date(cert.issue_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                      {cert.expiry_date && ` — ${new Date(cert.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
                    </p>
                  )}
                  {cert.credential_id && <p className="text-zinc-700 text-xs font-mono mt-1">{cert.credential_id}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {cert.credential_url && (
                    <a href={cert.credential_url} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 text-zinc-400 hover:text-cyan-400 transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button onClick={() => openEdit(cert)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-purple-500/10 text-zinc-400 hover:text-purple-400 transition-colors">
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(cert.id, cert.title)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
