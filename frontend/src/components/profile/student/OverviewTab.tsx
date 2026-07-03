import React from 'react'
import { motion } from 'framer-motion'
import { FileText, Award, Code2, ClipboardList, Trophy, Sparkles, AlertCircle, CheckCircle, Clock } from 'lucide-react'
import { FullStudentProfile } from '../../../types/profile.types'
import ProgressRing from '../shared/ProgressRing'
import StrengthBar from '../shared/StrengthBar'

interface OverviewTabProps {
  profile: FullStudentProfile
  onTabChange: (tab: string) => void
}

export default function OverviewTab({ profile, onTabChange }: OverviewTabProps) {
  const { user, profile: sp, strength, academic_records, semester_marks, certifications, exams, achievements, skills, documents } = profile

  const stats = [
    { label: 'Documents',      value: documents?.length || 0,       icon: FileText,       tab: 'documents',      color: 'text-blue-400',   bg: 'bg-blue-500/10' },
    { label: 'Certifications', value: certifications?.length || 0,   icon: Award,          tab: 'certifications', color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Skill Sets',     value: skills ? Object.values({ a: skills.programming_languages, b: skills.frameworks, c: skills.soft_skills }).filter(a => Array.isArray(a) && a.length > 0).length : 0, icon: Code2, tab: 'skills', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Exam Results',   value: exams?.length || 0,            icon: ClipboardList,  tab: 'exams',          color: 'text-amber-400',  bg: 'bg-amber-500/10' },
    { label: 'Achievements',   value: achievements?.length || 0,     icon: Trophy,         tab: 'achievements',   color: 'text-emerald-400',bg: 'bg-emerald-500/10' },
    { label: 'Academic Levels',value: academic_records?.length || 0, icon: Sparkles,       tab: 'academic',       color: 'text-pink-400',   bg: 'bg-pink-500/10' },
  ]

  const pendingDocs = documents?.filter(d => d.verification_status === 'pending') || []
  const verifiedDocs = documents?.filter(d => d.verification_status === 'verified') || []
  const rejectedDocs = documents?.filter(d => d.verification_status === 'rejected') || []

  const latestSemester = semester_marks?.length
    ? semester_marks[semester_marks.length - 1]
    : null

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <h2 className="text-white text-lg font-bold">Portfolio Overview</h2>

      {/* Welcome card */}
      <div className="glass rounded-2xl p-6 bg-gradient-to-br from-purple-500/10 via-transparent to-cyan-500/5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-white text-lg font-semibold">Welcome, {user?.full_name?.split(' ')[0]}! 👋</h3>
            <p className="text-zinc-400 text-sm mt-1">
              Your digital academic portfolio is <span className="text-purple-400 font-semibold">{strength?.total || 0}% complete</span>.
              {(strength?.total || 0) < 80 && ' Complete your profile to unlock scholarship recommendations.'}
            </p>
            {sp?.user_id ? (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-zinc-500 text-xs">Student ID:</span>
                <span className="font-mono text-purple-400 font-bold text-sm bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20">{sp.user_id}</span>
              </div>
            ) : (
              <p className="text-zinc-600 text-xs mt-2">Student ID will be assigned after admission approval</p>
            )}
          </div>
          <ProgressRing percent={strength?.total || 0} size={80} strokeWidth={6} label={`${strength?.total || 0}%`} sublabel={strength?.label || ''} />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, tab, color, bg }, i) => (
          <motion.button key={label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07 }} onClick={() => onTabChange(tab)}
            className="glass rounded-2xl p-4 text-left hover:scale-[1.02] transition-transform group">
            <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <div className={`text-2xl font-bold ${color} group-hover:scale-110 transition-transform inline-block`}>{value}</div>
            <div className="text-zinc-500 text-xs mt-0.5">{label}</div>
          </motion.button>
        ))}
      </div>

      {/* Profile strength breakdown */}
      <div className="glass rounded-2xl p-5">
        <h3 className="text-white font-semibold mb-4 text-sm">Strength Breakdown</h3>
        <div className="space-y-3">
          {[
            { label: 'Personal Info', value: strength?.personal || 0, max: 25 },
            { label: 'Academic Records', value: strength?.academic || 0, max: 25 },
            { label: 'Skills & Links', value: strength?.skills || 0, max: 15 },
            { label: 'Documents', value: strength?.documents || 0, max: 15 },
            { label: 'Achievements', value: strength?.achievements || 0, max: 10 },
            { label: 'Career Readiness', value: strength?.career || 0, max: 10 },
          ].map(({ label, value, max }, i) => (
            <StrengthBar key={label} label={label} value={value} max={max} color="auto" delay={i * 100} />
          ))}
        </div>
      </div>

      {/* Document status + latest CGPA row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Document verification summary */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-3 text-sm">Document Status</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-400" /><span className="text-zinc-400 text-sm">Verified</span></div>
              <span className="text-emerald-400 font-semibold">{verifiedDocs.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-400 animate-pulse" /><span className="text-zinc-400 text-sm">Pending Review</span></div>
              <span className="text-yellow-400 font-semibold">{pendingDocs.length}</span>
            </div>
            {rejectedDocs.length > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-red-400" /><span className="text-zinc-400 text-sm">Rejected</span></div>
                <span className="text-red-400 font-semibold">{rejectedDocs.length}</span>
              </div>
            )}
          </div>
          <button onClick={() => onTabChange('documents')}
            className="mt-4 w-full py-2 rounded-xl bg-white/5 border border-white/5 text-zinc-400 text-xs font-medium hover:bg-white/10 transition-colors">
            Manage Documents →
          </button>
        </div>

        {/* Academic summary */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-white font-semibold mb-3 text-sm">Academic Summary</h3>
          {latestSemester ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Latest CGPA</span>
                <span className="text-white font-bold text-lg">{latestSemester.cgpa || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Semester {latestSemester.semester} SGPA</span>
                <span className="text-cyan-400 font-semibold">{latestSemester.sgpa || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-zinc-400 text-sm">Levels on record</span>
                <span className="text-purple-400 font-semibold">{academic_records?.length || 0}</span>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-zinc-600 text-sm">No academic records yet</p>
              <button onClick={() => onTabChange('academic')}
                className="mt-2 text-purple-400 text-xs hover:text-purple-300">Add records →</button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
