import React, { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Camera, ArrowLeft, Edit3, RefreshCw, CheckCircle, Clock, Shield } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FullStudentProfile } from '../../types/profile.types'
import ProgressRing from './shared/ProgressRing'
import toast from 'react-hot-toast'

interface ProfileHeaderProps {
  profile: FullStudentProfile
  onRefreshAI: () => void
  aiRefreshing: boolean
}

const API_BASE = 'http://localhost:8000'

export default function ProfileHeader({ profile, onRefreshAI, aiRefreshing }: ProfileHeaderProps) {
  const navigate = useNavigate()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  const { user, profile: sp, strength } = profile
  const displayName = user?.full_name || 'Student'
  const initials = displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
  const total = strength?.total || 0
  const label = strength?.label || 'Getting Started'

  const labelColor = {
    'Excellent': 'text-emerald-400',
    'Strong': 'text-cyan-400',
    'Good': 'text-purple-400',
    'Building': 'text-amber-400',
    'Getting Started': 'text-zinc-400',
  }[label] || 'text-zinc-400'

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { toast.error('Please upload an image file'); return }
    if (file.size > 5 * 1024 * 1024) { toast.error('Photo must be under 5MB'); return }

    setUploadingPhoto(true)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('category', 'identity')
      formData.append('sub_category', 'profile_photo')
      const res = await fetch(`${API_BASE}/api/student/documents`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
      })
      if (!res.ok) throw new Error()
      toast.success('Profile photo uploaded!')
    } catch {
      toast.error('Failed to upload photo')
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  return (
    <div className="glass-panel rounded-3xl p-6 md:p-8">
      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Back button */}
        <div className="hidden md:flex">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </button>
        </div>

        {/* Main content */}
        <div className="flex flex-1 items-center gap-6">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <div className="w-20 h-20 md:w-24 md:h-24 rounded-3xl bg-gradient-to-br from-purple-600 via-pink-500 to-cyan-500
                            flex items-center justify-center text-white font-bold text-2xl
                            shadow-2xl shadow-purple-500/30 ring-2 ring-white/10 overflow-hidden">
              {sp?.photo_url ? (
                <img src={sp.photo_url} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                initials
              )}
              {uploadingPhoto && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-xl bg-purple-600 border border-[#0a0a1f]
                         flex items-center justify-center hover:bg-purple-500 transition-colors"
              title="Change profile photo"
            >
              <Camera className="w-3.5 h-3.5 text-white" />
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </div>

          {/* Name / ID / Status */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-bold text-white">{displayName}</h1>
              {user?.email_verified && (
                <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" title="Email verified" />
              )}
            </div>
            <p className="text-zinc-400 text-sm truncate">{user?.email}</p>
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              {sp?.student_id ? (
                <span className="px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/20 text-purple-400 text-xs font-mono font-semibold">
                  {sp.student_id}
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-lg bg-zinc-800 border border-white/5 text-zinc-500 text-xs">
                  ID pending admission
                </span>
              )}
              {sp?.current_institution && (
                <span className="text-zinc-500 text-xs truncate">{sp.current_institution}</span>
              )}
              {sp?.department && (
                <span className="text-zinc-600 text-xs">{sp.department}</span>
              )}
            </div>
          </div>
        </div>

        {/* Strength Ring + AI Refresh */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="flex flex-col items-center gap-1">
            <ProgressRing
              percent={total}
              size={90}
              strokeWidth={7}
              label={`${total}%`}
              sublabel={label}
            />
            <span className={`text-xs font-semibold ${labelColor}`}>{label}</span>
          </div>

          <div className="flex flex-col gap-2">
            <button
              onClick={onRefreshAI}
              disabled={aiRefreshing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-cyan-500/20
                         border border-purple-500/20 text-purple-400 text-xs font-medium
                         hover:from-purple-600/30 hover:to-cyan-500/30 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiRefreshing ? 'animate-spin' : ''}`} />
              {aiRefreshing ? 'Analyzing...' : 'AI Insights'}
            </button>
            <button
              onClick={() => navigate('/student/profile?tab=security')}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/5
                         text-zinc-400 text-xs font-medium hover:bg-white/10 transition-all"
            >
              <Shield className="w-3.5 h-3.5" />
              Security
            </button>
          </div>
        </div>
      </div>

      {/* Strength sub-bar row */}
      <div className="mt-6 grid grid-cols-3 md:grid-cols-6 gap-3">
        {[
          { label: 'Personal', val: strength?.personal || 0, max: 25 },
          { label: 'Academic', val: strength?.academic || 0, max: 25 },
          { label: 'Skills', val: strength?.skills || 0, max: 15 },
          { label: 'Documents', val: strength?.documents || 0, max: 15 },
          { label: 'Achievements', val: strength?.achievements || 0, max: 10 },
          { label: 'Career', val: strength?.career || 0, max: 10 },
        ].map(({ label, val, max }) => (
          <div key={label} className="text-center">
            <div className="text-zinc-500 text-xs mb-1">{label}</div>
            <div className="text-white text-sm font-bold">{Math.round((val / max) * 100)}%</div>
            <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-1000"
                style={{ width: `${Math.round((val / max) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
