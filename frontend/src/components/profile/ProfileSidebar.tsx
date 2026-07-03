import React from 'react'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, User, GraduationCap, FileText, Award, Code2,
  ClipboardList, Trophy, Sparkles, Activity, Settings, Shield, Bell,
  ChevronRight, Eye
} from 'lucide-react'

interface Tab {
  id: string
  label: string
  icon: React.FC<{className?: string}>
  badge?: number | string
}

const TABS: Tab[] = [
  { id: 'overview',       label: 'Overview',            icon: LayoutDashboard },
  { id: 'personal',       label: 'Personal Info',       icon: User },
  { id: 'academic',       label: 'Academic',            icon: GraduationCap },
  { id: 'documents',      label: 'Documents',           icon: FileText },
  { id: 'certifications', label: 'Certifications',      icon: Award },
  { id: 'skills',         label: 'Skills',              icon: Code2 },
  { id: 'exams',          label: 'Entrance Exams',      icon: ClipboardList },
  { id: 'achievements',   label: 'Achievements',        icon: Trophy },
  { id: 'ai-insights',    label: 'AI Insights',         icon: Sparkles },
  { id: 'timeline',       label: 'Timeline',            icon: Activity },
  { id: 'preferences',    label: 'Preferences',         icon: Settings },
  { id: 'privacy',        label: 'Privacy',             icon: Eye },
  { id: 'security',       label: 'Security',            icon: Shield },
]

interface ProfileSidebarProps {
  activeTab: string
  onTabChange: (tabId: string) => void
  notificationCount?: number
  strengthTotal?: number
}

export default function ProfileSidebar({ activeTab, onTabChange, notificationCount = 0, strengthTotal = 0 }: ProfileSidebarProps) {
  return (
    <aside className="w-full md:w-64 flex-shrink-0">
      <div className="glass-panel rounded-2xl p-2 sticky top-6">
        {/* Completion summary */}
        <div className="px-3 py-3 mb-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">Profile Strength</span>
            <span className="text-white text-xs font-bold">{strengthTotal}%</span>
          </div>
          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${strengthTotal}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full rounded-full bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-400"
            />
          </div>
        </div>

        <div className="w-full h-px bg-white/5 mb-1" />

        {/* Tab list */}
        <nav className="space-y-0.5">
          {TABS.map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id
            return (
              <button
                key={id}
                onClick={() => onTabChange(id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
                  transition-all duration-200 group
                  ${isActive
                    ? 'bg-gradient-to-r from-purple-500/15 to-cyan-500/5 border border-purple-500/25 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }
                `}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 transition-colors
                  ${isActive ? 'text-purple-400' : 'text-zinc-600 group-hover:text-zinc-400'}`}
                />
                <span className="text-sm font-medium flex-1">{label}</span>
                {id === 'ai-insights' && (
                  <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse flex-shrink-0" />
                )}
                {isActive && <ChevronRight className="w-3 h-3 text-purple-400/60 flex-shrink-0" />}
              </button>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}
