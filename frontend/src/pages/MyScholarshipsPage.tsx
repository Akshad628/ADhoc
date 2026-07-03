import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Award, FileText, X, AlertCircle, CheckCircle, Clock, Calendar } from 'lucide-react'
import { apiFetch } from '../hooks/useApi'
import toast from 'react-hot-toast'

interface Application {
  id: string
  scholarship_id: string
  student_id: string
  application_status: string
  application_date: string
  remarks?: string
  admin_comments?: string
  approved_amount?: number
  reviewed_at?: string
  scholarship?: {
    title: string
    provider_name: string
    scholarship_amount: number
    description?: string
    eligibility_criteria?: string
    required_documents?: string[]
  }
}

export default function MyScholarshipsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [selectedApp, setSelectedApp] = useState<Application | null>(null)

  useEffect(() => {
    loadApplications()
  }, [])

  const loadApplications = async () => {
    try {
      const data = await apiFetch('/api/student/my-scholarships')
      setApplications(data)
    } catch (e) {
      toast.error('Failed to load scholarship applications')
    } finally {
      setLoading(false)
    }
  }

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

  const filteredApps = applications.filter(a => {
    const title = a.scholarship?.title || ''
    const provider = a.scholarship?.provider_name || ''
    const matchesSearch = title.toLowerCase().includes(searchQuery.toLowerCase()) || provider.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'All' || a.application_status === statusFilter
    return matchesSearch && matchesStatus
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight">My Scholarship Applications</h1>
        <p className="text-zinc-400">Track and view details of all your submitted scholarship applications.</p>
      </div>

      {/* Filters & Search */}
      <div className="flex gap-4 items-center flex-wrap">
        <div className="flex-1 max-w-sm relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input type="text" placeholder="Search scholarship or provider..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
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

      {loading ? (
        <div className="h-64 flex items-center justify-center text-zinc-500">Loading your applications...</div>
      ) : (
        <div className="glass rounded-2xl overflow-hidden border border-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-xs font-semibold text-zinc-500 border-b border-white/10 bg-white/[0.01]">
                  <th className="px-6 py-4">SCHOLARSHIP</th>
                  <th className="px-6 py-4">PROVIDER</th>
                  <th className="px-6 py-4">APPLIED DATE</th>
                  <th className="px-6 py-4">STATUS</th>
                  <th className="px-6 py-4">AMOUNT</th>
                  <th className="px-6 py-4">REMARKS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredApps.map(a => (
                  <tr key={a.id} onClick={() => setSelectedApp(a)}
                    className="hover:bg-white/[0.02] cursor-pointer transition-colors text-sm">
                    <td className="px-6 py-4 font-semibold text-white truncate max-w-xs">{a.scholarship?.title}</td>
                    <td className="px-6 py-4 text-zinc-400">{a.scholarship?.provider_name}</td>
                    <td className="px-6 py-4 text-zinc-400">{a.application_date ? new Date(a.application_date).toLocaleDateString() : 'N/A'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getStatusColor(a.application_status)}`}>
                        {a.application_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-purple-400 font-semibold">₹{a.scholarship?.scholarship_amount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-zinc-400 truncate max-w-xs">{a.remarks || '-'}</td>
                  </tr>
                ))}
                {filteredApps.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-zinc-500">No applications found matching the criteria.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── SIDE DRAWER DETAIL PANEL ─────────────────────────────────────── */}
      <AnimatePresence>
        {selectedApp && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
            {/* Click outside to close */}
            <div className="absolute inset-0" onClick={() => setSelectedApp(null)} />
            
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'tween', duration: 0.3 }}
              className="glass border-l border-white/10 w-full max-w-lg h-full p-6 shadow-2xl overflow-y-auto relative z-10 flex flex-col justify-between">
              
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Award className="text-purple-400" /> Application Details
                  </h2>
                  <button onClick={() => setSelectedApp(null)}
                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white transition-all">
                    <X size={18} />
                  </button>
                </div>

                <div className="space-y-4 text-sm text-zinc-300">
                  <div>
                    <h3 className="text-lg font-bold text-white">{selectedApp.scholarship?.title}</h3>
                    <p className="text-xs text-zinc-500">Provider: {selectedApp.scholarship?.provider_name}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                    <div>
                      <p className="text-xs text-zinc-500">Application Status</p>
                      <span className={`inline-block px-2.5 py-0.5 mt-1 rounded-full text-xs font-semibold ${getStatusColor(selectedApp.application_status)}`}>
                        {selectedApp.application_status}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">Scholarship Amount</p>
                      <p className="text-lg font-black text-purple-400 mt-0.5">₹{selectedApp.scholarship?.scholarship_amount.toLocaleString()}</p>
                    </div>
                  </div>

                  {selectedApp.approved_amount && selectedApp.application_status === 'Approved' && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl">
                      <p className="text-xs text-emerald-400 font-semibold uppercase tracking-wider">Approved Amount</p>
                      <p className="text-2xl font-black text-emerald-400 mt-1">₹{selectedApp.approved_amount.toLocaleString()}</p>
                    </div>
                  )}

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Scheme Information</h4>
                    <p><span className="text-zinc-500 font-medium">Description:</span> {selectedApp.scholarship?.description || 'No description available.'}</p>
                    <p><span className="text-zinc-500 font-medium">Eligibility Criteria:</span> {selectedApp.scholarship?.eligibility_criteria || 'None'}</p>
                  </div>

                  {selectedApp.scholarship?.required_documents && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Documents Submitted</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedApp.scholarship.required_documents.map(d => (
                          <span key={d} className="text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1 flex items-center gap-1.5">
                            <FileText size={12} className="text-zinc-400" /> {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 border-t border-white/5 pt-4">
                    <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase">Application History</h4>
                    <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                      <Calendar size={14} /> Applied on {new Date(selectedApp.application_date).toLocaleString()}
                    </p>
                    {selectedApp.reviewed_at && (
                      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <CheckCircle size={14} className="text-emerald-400" /> Reviewed on {new Date(selectedApp.reviewed_at).toLocaleString()}
                      </p>
                    )}
                  </div>

                  {(selectedApp.remarks || selectedApp.admin_comments) && (
                    <div className="space-y-2.5 border-t border-white/5 pt-4">
                      <h4 className="text-xs font-bold text-purple-400 tracking-wider uppercase font-semibold">Remarks & Comments</h4>
                      {selectedApp.remarks && (
                        <div>
                          <p className="text-xs text-zinc-500 font-medium">Status Remarks:</p>
                          <p className="text-sm text-zinc-300 bg-white/[0.01] border border-white/5 p-2 rounded-xl mt-1">{selectedApp.remarks}</p>
                        </div>
                      )}
                      {selectedApp.admin_comments && (
                        <div>
                          <p className="text-xs text-zinc-500 font-medium">Admin Comments:</p>
                          <p className="text-sm text-zinc-300 bg-white/[0.01] border border-white/5 p-2 rounded-xl mt-1">{selectedApp.admin_comments}</p>
                        </div>
                      )}
                    </div>
                  )}

                </div>
              </div>

              <div className="pt-6">
                <button onClick={() => setSelectedApp(null)}
                  className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl text-sm font-semibold transition-all">
                  Close Details
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
