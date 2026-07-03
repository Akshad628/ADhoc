import React, { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster } from 'react-hot-toast'

import { useStudentProfile } from '../hooks/useStudentProfile'
import { useAIInsights } from '../hooks/useAIInsights'

import ProfileHeader from '../components/profile/ProfileHeader'
import ProfileSidebar from '../components/profile/ProfileSidebar'

import OverviewTab         from '../components/profile/student/OverviewTab'
import PersonalInfoTab     from '../components/profile/shared/PersonalInfoTab'
import AcademicInfoTab     from '../components/profile/student/AcademicInfoTab'
import DocumentsTab        from '../components/profile/student/DocumentsTab'
import CertificationsTab   from '../components/profile/student/CertificationsTab'
import SkillsTab           from '../components/profile/student/SkillsTab'
import EntranceExamsTab    from '../components/profile/student/EntranceExamsTab'
import AchievementsTab     from '../components/profile/student/AchievementsTab'
import AIInsightsTab       from '../components/profile/student/AIInsightsTab'
import TimelineTab         from '../components/profile/student/TimelineTab'
import PreferencesTab      from '../components/profile/student/PreferencesTab'
import PrivacyTab          from '../components/profile/student/PrivacyTab'
import SecurityTab         from '../components/profile/shared/SecurityTab'

import SkeletonCard        from '../components/profile/shared/SkeletonCard'

export default function StudentProfilePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const activeTab = searchParams.get('tab') || 'overview'

  const { profile, loading, saving, fetchProfile, updateProfile } = useStudentProfile()
  const { refreshInsights, refreshing } = useAIInsights()

  const setTab = (tab: string) => setSearchParams({ tab })

  // Update page title
  useEffect(() => {
    document.title = 'My Portfolio | Student Dashboard'
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050510] p-6 space-y-4">
        <SkeletonCard rows={4} height={120} />
        <div className="flex gap-6">
          <SkeletonCard className="w-64" rows={12} height={400} />
          <SkeletonCard className="flex-1" rows={8} height={300} />
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-[#050510] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-400 text-lg mb-4">Failed to load profile</p>
          <button onClick={fetchProfile} className="px-4 py-2 rounded-xl bg-purple-600 text-white text-sm hover:bg-purple-500">
            Try again
          </button>
        </div>
      </div>
    )
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab profile={profile} onTabChange={setTab} />
      case 'personal':
        return <PersonalInfoTab profile={profile} onUpdate={updateProfile} saving={saving} />
      case 'academic':
        return <AcademicInfoTab records={profile.academic_records} semesters={profile.semester_marks} onRefresh={fetchProfile} />
      case 'documents':
        return <DocumentsTab />
      case 'certifications':
        return <CertificationsTab />
      case 'skills':
        return <SkillsTab />
      case 'exams':
        return <EntranceExamsTab />
      case 'achievements':
        return <AchievementsTab achievements={profile.achievements} onRefresh={fetchProfile} />
      case 'ai-insights':
        return <AIInsightsTab onRefresh={refreshInsights} refreshing={refreshing} />
      case 'timeline':
        return <TimelineTab />
      case 'preferences':
        return <PreferencesTab />
      case 'privacy':
        return <PrivacyTab />
      case 'security':
        return <SecurityTab />
      default:
        return <OverviewTab profile={profile} onTabChange={setTab} />
    }
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: 'rgba(18,18,40,0.95)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(12px)' },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />

      <div className="min-h-screen bg-[#050510] text-white">
        {/* Background decoration */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full bg-purple-600/5 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] rounded-full bg-cyan-600/5 blur-3xl" />
        </div>

        <div className="relative z-10 max-w-screen-xl mx-auto px-4 py-6 md:px-6 space-y-5">
          {/* SEO */}
          <title>My Academic Portfolio | Student Dashboard</title>

          {/* Header */}
          <ProfileHeader profile={profile} onRefreshAI={refreshInsights} aiRefreshing={refreshing} />

          {/* Body: Sidebar + Tab Content */}
          <div className="flex flex-col md:flex-row gap-5">
            <ProfileSidebar
              activeTab={activeTab}
              onTabChange={setTab}
              strengthTotal={profile.strength?.total || 0}
            />

            <main className="flex-1 min-w-0">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  {renderTab()}
                </motion.div>
              </AnimatePresence>
            </main>
          </div>
        </div>
      </div>
    </>
  )
}
