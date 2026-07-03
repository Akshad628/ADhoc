import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Eye, Edit2, Trash2, Award, FileText, CheckCircle, XCircle, Mail, Phone, Search, Power } from 'lucide-react'
import { apiFetch } from '../../hooks/useApi'
import toast from 'react-hot-toast'

interface Scholarship {
  id: string
  title: string
  provider_name: string
  scholarship_type: string
  description?: string
  eligibility_criteria?: string
  eligible_courses?: string[]
  eligible_categories?: string[]
  minimum_percentage?: number
  annual_income_limit?: number
  scholarship_amount: number
  application_start_date?: string
  application_end_date?: string
  application_link?: string
  required_documents?: string[]
  contact_email?: string
  contact_phone?: string
  status: 'Draft' | 'Active' | 'Expired' | 'draft' | 'active' | 'expired'
  is_featured: boolean
  created_at?: string
  updated_at?: string
}

interface Application {
  id: string
  scholarship_id: string
  student_id: string
  application_status: string
  application_date: string
  remarks?: string
  admin_comments?: string
  approved_amount?: number
  reviewed_by?: string
  reviewed_at?: string
  student?: {
    full_name: string
    email: string
  }
  scholarship?: {
    title: string
    provider_name: string
    scholarship_amount: number
  }
}

const TYPES = ['Government', 'Private', 'University', 'NGO', 'Corporate', 'International', 'Minority', 'Merit', 'Need Based', 'Sports', 'Other']
const STATUSES = ['draft', 'active', 'expired']
const COURSES = ['10th Class', '12th Class', 'Diploma', 'B.Tech', 'B.Sc', 'B.Com', 'M.Tech', 'MBA', 'PhD', 'Other']
const CATEGORIES_LIST = ['General', 'OBC', 'SC', 'ST', 'EWS', 'Minority', 'All']

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

export default function AdminScholarshipsPage() {
  const [activeTab, setActiveTab] = useState<'scholarships' | 'applications'>('scholarships')
  const [scholarships, setScholarships] = useState<Scholarship[]>([])
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')

  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false)
  const [editingScholarship, setEditingScholarship] = useState<Scholarship | null>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  const [viewingScholarship, setViewingScholarship] = useState<Scholarship | null>(null)

  const [showAppModal, setShowAppModal] = useState(false)
  const [viewingApp, setViewingApp] = useState<Application | null>(null)

  // Form State
  const [form, setForm] = useState<Partial<Scholarship>>({
    title: '',
    provider_name: '',
    scholarship_type: 'Government',
    description: '',
    eligibility_criteria: '',
    eligible_courses: [],
    eligible_categories: [],
    minimum_percentage: undefined,
    annual_income_limit: undefined,
    scholarship_amount: 0,
    application_start_date: '',
    application_end_date: '',
    application_link: '',
    required_documents: ['Aadhaar Card', 'Marks Memo', 'Income Certificate'],
    contact_email: '',
    contact_phone: '',
    status: 'draft',
    is_featured: false,
  })

  // Application Edit State
  const [appForm, setAppForm] = useState({
    application_status: 'Applied',
    remarks: '',
    admin_comments: '',
    approved_amount: 0,
  })

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'scholarships') {
        const data = await apiFetch('/api/admin/scholarships')
        setScholarships(data)
      } else {
        const data = await apiFetch('/api/admin/scholarship-applications')
        setApplications(data)
      }
    } catch (e) {
      toast.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const handleOpenAdd = () => {
    setEditingScholarship(null)
    setForm({
      title: '',
      provider_name: '',
      scholarship_type: 'Government',
      description: '',
      eligibility_criteria: '',
      eligible_courses: [],
      eligible_categories: [],
      minimum_percentage: undefined,
      annual_income_limit: undefined,
      scholarship_amount: 0,
      application_start_date: '',
      application_end_date: '',
      application_link: '',
      required_documents: ['Aadhaar Card', 'Marks Memo', 'Income Certificate'],
      contact_email: '',
      contact_phone: '',
      status: 'draft',
      is_featured: false,
    })
    setShowAddEditModal(true)
  }

  const handleOpenEdit = (s: Scholarship) => {
    setEditingScholarship(s)
    setForm({ ...s })
    setShowAddEditModal(true)
  }

  const handleSaveScholarship = async () => {
    if (!form.title) { toast.error('Title is required'); return }
    if (!form.provider_name) { toast.error('Provider Name is required'); return }
    if (!form.scholarship_amount || form.scholarship_amount <= 0) { toast.error('Scholarship Amount must be a positive number'); return }

    if (form.application_start_date && form.application_end_date) {
      if (form.application_end_date < form.application_start_date) {
        toast.error('Application end date cannot be before start date.');
        return
      }
    }

    if (form.minimum_percentage !== undefined && (form.minimum_percentage < 0 || form.minimum_percentage > 100)) {
      toast.error('Minimum percentage must be between 0 and 100.');
      return
    }

    if (form.annual_income_limit !== undefined && form.annual_income_limit <= 0) {
      toast.error('Annual income limit must be a positive number.');
      return
    }

    try {
      const url = editingScholarship ? `/api/admin/scholarships/${editingScholarship.id}` : '/api/admin/scholarships'
      const method = editingScholarship ? 'PUT' : 'POST'
      const data = await apiFetch(url, {
        method,
        body: JSON.stringify(form)
      })
      toast.success(editingScholarship ? 'Scholarship updated!' : 'Scholarship created!')
      setShowAddEditModal(false)
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Network error occurred')
    }
  }

  const handleDeleteScholarship = async (id: string) => {
    if (!confirm('Are you sure you want to delete this scholarship?')) return
    try {
      await apiFetch(`/api/admin/scholarships/${id}`, { method: 'DELETE' })
      toast.success('Scholarship deleted!')
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Delete failed')
    }
  }

  const handleToggleStatus = async (s: Scholarship) => {
    const nextStatus = s.status?.toLowerCase() === 'active' ? 'expired' : 'active'
    try {
      await apiFetch(`/api/admin/scholarships/${s.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: nextStatus })
      })
      toast.success(`Scholarship status set to ${nextStatus}`)
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to change status')
    }
  }

  // Application details editor
  const handleOpenApp = (a: Application) => {
    setViewingApp(a)
    setAppForm({
      application_status: a.application_status,
      remarks: a.remarks || '',
      admin_comments: a.admin_comments || '',
      approved_amount: a.approved_amount || a.scholarship?.scholarship_amount || 0,
    })
    setShowAppModal(true)
  }

  const handleUpdateAppStatus = async (statusOverride?: string) => {
    if (!viewingApp) return
    const updatedStatus = statusOverride || appForm.application_status
    try {
      await apiFetch(`/api/admin/scholarship-applications/${viewingApp.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          application_status: updatedStatus,
          remarks: appForm.remarks,
          admin_comments: appForm.admin_comments,
          approved_amount: appForm.approved_amount
        })
      })
      toast.success('Application status updated!')
      setViewingApp(null)
      loadData()
    } catch (e: any) {
      toast.error(e.message || 'Failed to update application')
    }
  }

  // Filters for applications
  const filteredApps = applications.filter(a => {
    const matchesSearch = 
      (a.student?.full_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.student?.email || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.scholarship?.title || '').toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'All' || a.application_status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Format status badge
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Applied': return 'bg-purple-500/20 text-purple-400 border border-purple-500/20'
      case 'Under Review': return 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/20'
      case 'Shortlisted': return 'bg-blue-500/20 text-blue-400 border border-blue-500/20'
      case 'Approved': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20'
      case 'Rejected': return 'bg-red-500/20 text-red-400 border border-red-500/20'
      case 'Cancelled': return 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/20'
      default: return 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/20'
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">Scholarships</h1>
          <p className="text-zinc-400">Manage scholarship schemes and review student applications.</p>
        </div>
        {activeTab === 'scholarships' && (
          <button onClick={handleOpenAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-500 text-white rounded-xl text-sm font-semibold shadow-lg hover:opacity-90 active:scale-95 transition-all">
            <Plus size={18} /> Add Scholarship
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10 gap-6">
        <button onClick={() => setActiveTab('scholarships')}
          className={`pb-3 font-semibold text-sm transition-all ${activeTab === 'scholarships' ? 'border-b-2 border-purple-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
          Manage Scholarships
        </button>
        <button onClick={() => setActiveTab('applications')}
          className={`pb-3 font-semibold text-sm transition-all ${activeTab === 'applications' ? 'border-b-2 border-purple-500 text-white' : 'text-zinc-400 hover:text-white'}`}>
          Applications ({applications.length})
        </button>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-zinc-500">Loading data...</div>
      ) : activeTab === 'scholarships' ? (
        // SCHOLARSHIPS TABLE
        <div className="glass rounded-2xl overflow-hidden border border-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-zinc-500 border-b border-white/10 bg-white/[0.01]">
                  <th className="px-6 py-4">TITLE</th>
                  <th className="px-6 py-4">PROVIDER</th>
                  <th className="px-6 py-4">TYPE</th>
                  <th className="px-6 py-4">AMOUNT</th>
                  <th className="px-6 py-4">DEADLINE</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4">FEATURED</th>
                  <th className="px-6 py-4 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {scholarships.map(s => (
                  <tr key={s.id} className="hover:bg-white/[0.02] transition-colors text-sm">
                    <td className="px-6 py-4 font-semibold text-white truncate max-w-xs">{s.title}</td>
                    <td className="px-6 py-4 text-zinc-400">{s.provider_name}</td>
                    <td className="px-6 py-4 text-zinc-400">{s.scholarship_type}</td>
                    <td className="px-6 py-4 text-purple-400 font-semibold">₹{s.scholarship_amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-zinc-400">{s.application_end_date || 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${s.status?.toLowerCase() === 'active' ? 'bg-emerald-500/20 text-emerald-400' : s.status?.toLowerCase() === 'expired' ? 'bg-red-500/20 text-red-400' : 'bg-zinc-500/20 text-zinc-400'}`}>
                        {s.status?.toLowerCase() === 'active' ? 'Active' : s.status?.toLowerCase() === 'expired' ? 'Expired' : 'Draft'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {s.is_featured ? (
                        <span className="text-amber-400 flex items-center gap-1"><Award size={14} /> Yes</span>
                      ) : (
                        <span className="text-zinc-600">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2">
                      <button onClick={() => { setViewingScholarship(s); setShowViewModal(true) }} title="View details"
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
                        <Eye size={14} />
                      </button>
                      <button onClick={() => handleOpenEdit(s)} title="Edit"
                        className="p-2 rounded-xl bg-white/5 hover:bg-purple-500/10 text-zinc-400 hover:text-purple-400 transition-all">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleToggleStatus(s)} title={s.status?.toLowerCase() === 'active' ? 'Set Expired' : 'Set Active'}
                        className={`p-2 rounded-xl bg-white/5 hover:bg-yellow-500/10 text-zinc-400 hover:text-yellow-400 transition-all`}>
                        <Power size={14} />
                      </button>
                      <button onClick={() => handleDeleteScholarship(s.id)} title="Delete"
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/10 text-zinc-400 hover:text-red-400 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {scholarships.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-zinc-500">No scholarships configured. Click "Add Scholarship" to create one.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // APPLICATIONS TAB
        <div className="space-y-4">
          <div className="flex gap-4 items-center flex-wrap">
            <div className="flex-1 max-w-sm relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input type="text" placeholder="Search student name, email, scholarship..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 transition-all" />
            </div>
            <div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500/50">
                <option value="All" className="bg-[#1a1a2e]">All Statuses</option>
                <option value="Applied" className="bg-[#1a1a2e]">Applied</option>
                <option value="Under Review" className="bg-[#1a1a2e]">Under Review</option>
                <option value="Shortlisted" className="bg-[#1a1a2e]">Shortlisted</option>
                <option value="Approved" className="bg-[#1a1a2e]">Approved</option>
                <option value="Rejected" className="bg-[#1a1a2e]">Rejected</option>
                <option value="Cancelled" className="bg-[#1a1a2e]">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="glass rounded-2xl overflow-hidden border border-white/[0.02]">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-semibold text-zinc-500 border-b border-white/10 bg-white/[0.01]">
                    <th className="px-6 py-4">STUDENT NAME</th>
                    <th className="px-6 py-4">EMAIL</th>
                    <th className="px-6 py-4">SCHOLARSHIP</th>
                    <th className="px-6 py-4">APPLIED DATE</th>
                    <th className="px-6 py-4">STATUS</th>
                    <th className="px-6 py-4">AMOUNT</th>
                    <th className="px-6 py-4 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredApps.map(a => (
                    <tr key={a.id} className="hover:bg-white/[0.02] transition-colors text-sm">
                      <td className="px-6 py-4 font-semibold text-white">{a.student?.full_name}</td>
                      <td className="px-6 py-4 text-zinc-400">{a.student?.email}</td>
                      <td className="px-6 py-4 text-zinc-400 font-semibold truncate max-w-xs">{a.scholarship?.title}</td>
                      <td className="px-6 py-4 text-zinc-400">{a.application_date ? new Date(a.application_date).toLocaleDateString() : 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(a.application_status)}`}>
                          {a.application_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-purple-400 font-semibold">₹{a.scholarship?.scholarship_amount.toLocaleString()}</td>
                      <td className="px-6 py-4 text-right flex items-center justify-end gap-1.5">
                        <button onClick={() => handleOpenApp(a)}
                          className="px-3 py-1.5 bg-white/5 hover:bg-purple-500/10 text-zinc-300 hover:text-purple-400 rounded-xl text-xs font-semibold transition-all">
                          Review
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredApps.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-zinc-500">No student applications found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── ADD/EDIT SCHOLARSHIP MODAL ────────────────────────────────────── */}
      <AnimatePresence>
        {showAddEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto border border-white/10 shadow-2xl p-6 space-y-6">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-3">
                {editingScholarship ? 'Edit Scholarship' : 'Add Scholarship'}
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Basic info */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Basic Information</h3>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Scholarship Title *</label>
                    <input className={INPUT_CLASS} placeholder="e.g. Merit-cum-Means Scheme" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Provider Name *</label>
                    <input className={INPUT_CLASS} placeholder="e.g. Ministry of Education" value={form.provider_name} onChange={e => setForm({ ...form, provider_name: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Scholarship Type</label>
                      <select className={INPUT_CLASS} value={form.scholarship_type} onChange={e => setForm({ ...form, scholarship_type: e.target.value })}>
                        {TYPES.map(t => <option key={t} value={t} className="bg-[#1a1a2e]">{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Amount (₹) *</label>
                      <input type="number" className={INPUT_CLASS} value={form.scholarship_amount || ''} onChange={e => setForm({ ...form, scholarship_amount: Number(e.target.value) })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Description</label>
                    <textarea className={`${INPUT_CLASS} h-24 resize-none`} placeholder="Detailed scholarship scheme description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>
                </div>

                {/* Eligibility & criteria */}
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Eligibility & Settings</h3>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Eligibility Criteria</label>
                    <textarea className={`${INPUT_CLASS} h-20 resize-none`} placeholder="General eligibility details..." value={form.eligibility_criteria} onChange={e => setForm({ ...form, eligibility_criteria: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Min Percentage (%)</label>
                      <input type="number" className={INPUT_CLASS} placeholder="e.g. 75" value={form.minimum_percentage ?? ''} onChange={e => setForm({ ...form, minimum_percentage: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Max Annual Income (₹)</label>
                      <input type="number" className={INPUT_CLASS} placeholder="e.g. 500000" value={form.annual_income_limit ?? ''} onChange={e => setForm({ ...form, annual_income_limit: e.target.value ? Number(e.target.value) : undefined })} />
                    </div>
                  </div>
                  
                  {/* Multi selects */}
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Eligible Courses (Select Multiple)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-white/[0.02] border border-white/10">
                      {COURSES.map(c => {
                        const active = form.eligible_courses?.includes(c)
                        return (
                          <button key={c} type="button"
                            onClick={() => {
                              const curr = form.eligible_courses || []
                              const next = curr.includes(c) ? curr.filter(x => x !== c) : [...curr, c]
                              setForm({ ...form, eligible_courses: next })
                            }}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${active ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-white/5 border-transparent text-zinc-400 hover:bg-white/10'}`}>
                            {c}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Eligible Categories (Select Multiple)</label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-white/[0.02] border border-white/10">
                      {CATEGORIES_LIST.map(cat => {
                        const active = form.eligible_categories?.includes(cat)
                        return (
                          <button key={cat} type="button"
                            onClick={() => {
                              const curr = form.eligible_categories || []
                              const next = curr.includes(cat) ? curr.filter(x => x !== cat) : [...curr, cat]
                              setForm({ ...form, eligible_categories: next })
                            }}
                            className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${active ? 'bg-purple-600/30 border-purple-500 text-white' : 'bg-white/5 border-transparent text-zinc-400 hover:bg-white/10'}`}>
                            {cat}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Dates & Contact */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Application link & Dates</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Start Date</label>
                      <input type="date" className={INPUT_CLASS} value={form.application_start_date || ''} onChange={e => setForm({ ...form, application_start_date: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">End Date</label>
                      <input type="date" className={INPUT_CLASS} value={form.application_end_date || ''} onChange={e => setForm({ ...form, application_end_date: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Application Link (Optional)</label>
                    <input className={INPUT_CLASS} placeholder="https://..." value={form.application_link || ''} onChange={e => setForm({ ...form, application_link: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Contact Details & Settings</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Contact Email</label>
                      <input type="email" className={INPUT_CLASS} placeholder="support@..." value={form.contact_email || ''} onChange={e => setForm({ ...form, contact_email: e.target.value })} />
                    </div>
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Contact Phone</label>
                      <input type="tel" className={INPUT_CLASS} placeholder="e.g. +91 99..." value={form.contact_phone || ''} onChange={e => setForm({ ...form, contact_phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-1">
                    <div>
                      <label className="block text-zinc-400 text-xs font-medium mb-1.5">Status</label>
                      <select className={INPUT_CLASS} value={form.status?.toLowerCase()} onChange={e => setForm({ ...form, status: e.target.value as any })}>
                        {STATUSES.map(st => <option key={st} value={st} className="bg-[#1a1a2e]">{st === 'active' ? 'Active' : st === 'draft' ? 'Draft' : 'Expired'}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center gap-3 mt-6 pl-2">
                      <input type="checkbox" id="featured_chk" checked={form.is_featured} onChange={e => setForm({ ...form, is_featured: e.target.checked })}
                        className="rounded bg-white/5 border-white/10 text-purple-500 focus:ring-0 focus:ring-offset-0 h-4.5 w-4.5" />
                      <label htmlFor="featured_chk" className="text-sm font-semibold text-white select-none cursor-pointer">Featured Scholarship</label>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-end border-t border-white/10 pt-4 gap-3">
                <button onClick={() => setShowAddEditModal(false)}
                  className="px-5 py-2 rounded-xl text-sm font-semibold text-zinc-400 hover:text-white hover:bg-white/5 transition-all">
                  Cancel
                </button>
                <button onClick={handleSaveScholarship}
                  className="px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-sm font-semibold shadow-md active:scale-95 transition-all">
                  Save Scholarship
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── DETAIL VIEW MODAL ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showViewModal && viewingScholarship && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl w-full max-w-2xl border border-white/10 shadow-2xl p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Award className="text-purple-400" /> {viewingScholarship.title}
                </h2>
                {viewingScholarship.is_featured && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/20">
                    Featured
                  </span>
                )}
              </div>

              <div className="space-y-3.5 text-sm text-zinc-300">
                <p><span className="text-zinc-500 font-medium">Provider:</span> <strong className="text-white">{viewingScholarship.provider_name}</strong></p>
                <p><span className="text-zinc-500 font-medium">Type:</span> {viewingScholarship.scholarship_type}</p>
                <p><span className="text-zinc-500 font-medium">Amount:</span> <strong className="text-purple-400 text-lg">₹{viewingScholarship.scholarship_amount.toLocaleString()}</strong></p>
                <p><span className="text-zinc-500 font-medium">Dates:</span> {viewingScholarship.application_start_date || 'N/A'} to {viewingScholarship.application_end_date || 'N/A'}</p>
                <p><span className="text-zinc-500 font-medium">Description:</span> {viewingScholarship.description || 'No description provided.'}</p>
                <p><span className="text-zinc-500 font-medium">Eligibility Criteria:</span> {viewingScholarship.eligibility_criteria || 'None'}</p>
                <p><span className="text-zinc-500 font-medium">Min Percentage:</span> {viewingScholarship.minimum_percentage ? `${viewingScholarship.minimum_percentage}%` : 'No minimum'}</p>
                <p><span className="text-zinc-500 font-medium">Income Limit:</span> {viewingScholarship.annual_income_limit ? `₹${viewingScholarship.annual_income_limit.toLocaleString()}` : 'No limit'}</p>
                <div>
                  <span className="text-zinc-500 font-medium">Eligible Courses:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewingScholarship.eligible_courses?.map(c => <span key={c} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2 py-0.5">{c}</span>) || 'All'}
                  </div>
                </div>
                <div>
                  <span className="text-zinc-500 font-medium">Required Documents:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {viewingScholarship.required_documents?.map(d => <span key={d} className="text-xs bg-purple-500/10 border border-purple-500/10 text-purple-300 rounded-lg px-2 py-0.5">{d}</span>) || 'None'}
                  </div>
                </div>
                <div className="flex items-center gap-6 border-t border-white/5 pt-3 text-xs text-zinc-400">
                  {viewingScholarship.contact_email && <span className="flex items-center gap-1"><Mail size={14} /> {viewingScholarship.contact_email}</span>}
                  {viewingScholarship.contact_phone && <span className="flex items-center gap-1"><Phone size={14} /> {viewingScholarship.contact_phone}</span>}
                </div>
              </div>

              <div className="flex items-center justify-end pt-2 border-t border-white/10">
                <button onClick={() => setShowViewModal(false)}
                  className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all">
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── REVIEW APPLICATION MODAL ────────────────────────────────────── */}
      <AnimatePresence>
        {showAppModal && viewingApp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="glass rounded-2xl w-full max-w-xl border border-white/10 shadow-2xl p-6 space-y-4">
              <h2 className="text-xl font-bold text-white border-b border-white/10 pb-3">
                Review Application
              </h2>

              <div className="space-y-3.5 text-sm text-zinc-300">
                <p><span className="text-zinc-500">Student:</span> <strong className="text-white">{viewingApp.student?.full_name}</strong> ({viewingApp.student?.email})</p>
                <p><span className="text-zinc-500">Scholarship:</span> <strong className="text-white">{viewingApp.scholarship?.title}</strong></p>
                <p><span className="text-zinc-500">Original Amount:</span> ₹{viewingApp.scholarship?.scholarship_amount.toLocaleString()}</p>
                <p><span className="text-zinc-500">Current Status:</span> <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(viewingApp.application_status)}`}>{viewingApp.application_status}</span></p>

                <div className="border-t border-white/5 pt-3 space-y-3">
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Application Status</label>
                    <select className={INPUT_CLASS} value={appForm.application_status} onChange={e => setAppForm({ ...appForm, application_status: e.target.value })}>
                      <option value="Applied" className="bg-[#1a1a2e]">Applied</option>
                      <option value="Under Review" className="bg-[#1a1a2e]">Under Review</option>
                      <option value="Shortlisted" className="bg-[#1a1a2e]">Shortlisted</option>
                      <option value="Approved" className="bg-[#1a1a2e]">Approved</option>
                      <option value="Rejected" className="bg-[#1a1a2e]">Rejected</option>
                      <option value="Cancelled" className="bg-[#1a1a2e]">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Approved Amount (₹)</label>
                    <input type="number" className={INPUT_CLASS} value={appForm.approved_amount} onChange={e => setAppForm({ ...appForm, approved_amount: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Remarks (visible to student)</label>
                    <input className={INPUT_CLASS} placeholder="e.g. Academic eligibility verified." value={appForm.remarks} onChange={e => setAppForm({ ...appForm, remarks: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-zinc-400 text-xs font-medium mb-1.5">Admin Comments (internal/auditing)</label>
                    <textarea className={`${INPUT_CLASS} h-20 resize-none`} placeholder="Internal review logs..." value={appForm.admin_comments} onChange={e => setAppForm({ ...appForm, admin_comments: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-white/10 pt-4 gap-3">
                <div className="flex gap-2">
                  <button onClick={() => handleUpdateAppStatus('Approved')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500/20 text-emerald-400 rounded-xl text-xs font-semibold hover:bg-emerald-500/30 transition-all">
                    <CheckCircle size={14} /> Approve
                  </button>
                  <button onClick={() => handleUpdateAppStatus('Rejected')}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-xl text-xs font-semibold hover:bg-red-500/30 transition-all">
                    <XCircle size={14} /> Reject
                  </button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAppModal(false)}
                    className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl text-xs font-semibold transition-all">
                    Close
                  </button>
                  <button onClick={() => handleUpdateAppStatus()}
                    className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold shadow-md active:scale-95 transition-all">
                    Save Changes
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
