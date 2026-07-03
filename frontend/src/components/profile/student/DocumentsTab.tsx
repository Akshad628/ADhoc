import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Upload, Trash2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { StudentDocument, DocumentCategory } from '../../../types/profile.types'
import { useStudentDocuments } from '../../../hooks/useStudentDocuments'
import UploadZone from '../shared/UploadZone'
import VerificationBadge from '../shared/VerificationBadge'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'
import ConfidenceTag from '../shared/ConfidenceTag'

const CATEGORIES: { value: DocumentCategory; label: string; subs: string[] }[] = [
  { value: 'identity',       label: 'Identity',         subs: ['aadhaar','pan_card','passport','driving_license','voter_id'] },
  { value: 'academic',       label: 'Academic',         subs: ['10th_memo','intermediate_memo','diploma_memo','degree_certificate','semester_marksheet'] },
  { value: 'entrance',       label: 'Entrance Exams',   subs: ['eamcet_scorecard','jee_scorecard','gate_scorecard','neet_scorecard','cuet_scorecard'] },
  { value: 'certification',  label: 'Certifications',   subs: ['course_certificate','workshop_certificate','hackathon_certificate'] },
  { value: 'achievement',    label: 'Achievements',     subs: ['award_certificate','prize','recognition'] },
  { value: 'internship',     label: 'Internship',       subs: ['offer_letter','completion_certificate','experience_letter'] },
  { value: 'placement',      label: 'Placement',        subs: ['resume','offer_letter','appointment_letter'] },
  { value: 'other',          label: 'Other',            subs: [] },
]

function formatBytes(b?: number) {
  if (!b) return ''
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function DocumentsTab() {
  const [filter, setFilter] = useState<string>('all')
  const [uploadCategory, setUploadCategory] = useState<DocumentCategory>('academic')
  const [uploadSubCategory, setUploadSubCategory] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [replaceDoc, setReplaceDoc] = useState<StudentDocument | null>(null)

  const { documents, loading, uploadDocument, replaceDocument, deleteDocument } = useStudentDocuments()

  const filtered = filter === 'all' ? documents : documents.filter(d => d.document_type === filter)

  const handleUpload = async (file: File) => {
    const result = await uploadDocument(file, uploadCategory, uploadSubCategory || undefined)
    if (result.success) { toast.success('Document uploaded successfully!'); setShowUpload(false) }
    else { toast.error(result.error || 'Upload failed') }
    return result
  }

  const handleReplace = async (file: File) => {
    if (!replaceDoc) return { success: false }
    const result = await replaceDocument(replaceDoc.id, file)
    if (result.success) { toast.success('Document replaced! Old version archived.'); setReplaceDoc(null) }
    else toast.error(result.error || 'Replace failed')
    return result
  }

  const handleDelete = async (doc: StudentDocument) => {
    if (!confirm(`Delete "${doc.file_name}"? This cannot be undone.`)) return
    const r = await deleteDocument(doc.id)
    if (r.success) toast.success('Document deleted')
    else toast.error(r.error || 'Failed to delete')
  }

  const hasOCR = (doc: StudentDocument) => {
    const meta = doc.extracted_data as Record<string, unknown>
    return meta && Object.keys(meta?.extracted || {}).length > 0
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-white text-lg font-bold">Documents ({documents.length})</h2>
        <button onClick={() => setShowUpload(!showUpload)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90">
          <Upload className="w-4 h-4" />Upload Document
        </button>
      </div>

      <AnimatePresence>
        {showUpload && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 overflow-hidden space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Category</label>
                <select className={INPUT_CLASS} value={uploadCategory} onChange={e => { setUploadCategory(e.target.value as DocumentCategory); setUploadSubCategory('') }}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value} className="bg-[#1a1a2e]">{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5">Document Type</label>
                <select className={INPUT_CLASS} value={uploadSubCategory} onChange={e => setUploadSubCategory(e.target.value)}>
                  <option value="" className="bg-[#1a1a2e]">General</option>
                  {(CATEGORIES.find(c => c.value === uploadCategory)?.subs || []).map(s => (
                    <option key={s} value={s} className="bg-[#1a1a2e]">{s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                  ))}
                </select>
              </div>
            </div>
            <UploadZone onUpload={handleUpload} />
          </motion.div>
        )}

        {replaceDoc && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl p-5 border border-amber-500/20 overflow-hidden">
            <p className="text-amber-400 text-sm font-medium mb-3">
              Replacing: {replaceDoc.file_name}
            </p>
            <p className="text-zinc-500 text-xs mb-3">The old version will be archived in version history.</p>
            <UploadZone onUpload={handleReplace} label="Upload Replacement" />
            <button onClick={() => setReplaceDoc(null)} className="mt-2 text-zinc-500 text-xs hover:text-white">Cancel</button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        {['all', ...CATEGORIES.map(c => c.value)].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all
              ${filter === cat ? 'bg-purple-600 text-white' : 'bg-white/5 text-zinc-400 hover:bg-white/10'}`}>
            {cat === 'all' ? 'All' : CATEGORIES.find(c => c.value === cat)?.label || cat}
          </button>
        ))}
      </div>

      {/* Documents list */}
      {loading ? <SkeletonRow count={5} /> : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description="Upload your academic documents to get started"
          action={{ label: 'Upload Document', onClick: () => setShowUpload(true) }} />
      ) : (
        <div className="space-y-2">
          {filtered.map((doc, i) => (
            <motion.div key={doc.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-2xl p-4 hover:bg-white/[0.04] transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{doc.file_name}</p>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className="text-zinc-600 text-xs capitalize">{doc.document_type}</span>
                      {doc.document_name && <span className="text-zinc-700 text-xs">• {doc.document_name.replace(/_/g, ' ')}</span>}
                      {doc.file_size && <span className="text-zinc-700 text-xs">• {formatBytes(doc.file_size)}</span>}
                      {false && (
                        <span className="text-zinc-600 text-xs">• v{1}</span>
                      )}
                    </div>
                    <div className="mt-2">
                      <VerificationBadge status={doc.verification_status} reviewComments={doc.verification_remarks}
                        rejectionReason={doc.verification_remarks} verifiedAt={doc.verified_at} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {doc.signed_url && (
                    <a href={doc.signed_url} target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button onClick={() => setReplaceDoc(doc)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-amber-500/10 text-zinc-400 hover:text-amber-400 transition-colors" title="Replace document">
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(doc)}
                    className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {doc.ai_summary && (
                <div className="mt-3 p-3 rounded-xl bg-purple-500/5 border border-purple-500/10 text-xs">
                  <p className="text-purple-400 font-semibold mb-1">🤖 AI Insights Summary</p>
                  <p className="text-zinc-300 leading-relaxed">{doc.ai_summary}</p>
                </div>
              )}

              {/* OCR confidence if available */}
              {hasOCR(doc) && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-zinc-500 text-xs font-medium mb-2">🔍 OCR Extracted Data</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {Object.entries((doc.extracted_data as Record<string, unknown>)?.extracted || {}).slice(0, 4).map(([field, val]: [string, unknown]) => {
                      const v = val as { value: string; confidence: number }
                      return <ConfidenceTag key={field} fieldName={field} value={v.value} confidence={v.confidence} />
                    })}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
