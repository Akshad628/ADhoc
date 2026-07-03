import React from 'react'
import { motion } from 'framer-motion'
import { Eye, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { useStudentPrivacy } from '../../../hooks/useStudentPrivacy'
import { VisibilityLevel, UpdatePrivacyRequest } from '../../../types/profile.types'
import PrivacyBadge from '../shared/PrivacyBadge'
import SkeletonCard from '../shared/SkeletonCard'

const FIELDS: { key: keyof UpdatePrivacyRequest; label: string; description: string }[] = [
  { key: 'personal_info_visibility',   label: 'Personal Information', description: 'Name, DOB, gender, Aadhaar, etc.' },
  { key: 'contact_visibility',          label: 'Contact Details',       description: 'Phone, email, address, parent info' },
  { key: 'academic_visibility',         label: 'Academic Records',      description: '10th, intermediate, UG records' },
  { key: 'documents_visibility',        label: 'Documents',             description: 'Uploaded documents and files' },
  { key: 'certifications_visibility',   label: 'Certifications',        description: 'Courses, hackathons, NSS/NCC' },
  { key: 'skills_visibility',           label: 'Skills & Links',        description: 'Technical skills and profile URLs' },
  { key: 'achievements_visibility',     label: 'Achievements',          description: 'Awards and recognition' },
  { key: 'exams_visibility',            label: 'Entrance Exams',        description: 'EAMCET, JEE, GATE scores' },
]

export default function PrivacyTab() {
  const { privacy, loading, saving, updatePrivacy } = useStudentPrivacy()
  const [local, setLocal] = React.useState<UpdatePrivacyRequest>({})

  React.useEffect(() => {
    if (privacy) {
      const { personal_info_visibility, contact_visibility, academic_visibility, documents_visibility,
        certifications_visibility, skills_visibility, achievements_visibility, exams_visibility, profile_public_link } = privacy
      setLocal({ personal_info_visibility, contact_visibility, academic_visibility, documents_visibility,
        certifications_visibility, skills_visibility, achievements_visibility, exams_visibility, profile_public_link })
    }
  }, [privacy])

  const set = (key: keyof UpdatePrivacyRequest, val: VisibilityLevel | boolean) =>
    setLocal(l => ({ ...l, [key]: val }))

  const handleSave = async () => {
    const r = await updatePrivacy(local)
    if (r.success) toast.success('Privacy settings saved!')
    else toast.error(r.error || 'Failed to save')
  }

  if (loading) return <SkeletonCard rows={8} />

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white text-lg font-bold">Privacy Settings</h2>
          <p className="text-zinc-500 text-sm mt-0.5">Control who can see each section of your portfolio</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          <Save className="w-4 h-4" />{saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Visibility levels legend */}
      <div className="glass rounded-2xl p-4">
        <p className="text-zinc-500 text-xs font-medium mb-3">Visibility Levels</p>
        <div className="flex flex-wrap gap-2">
          {(['private','institution','faculty','placement_cell','admission_officers','public'] as VisibilityLevel[]).map(v => (
            <PrivacyBadge key={v} value={v} readonly />
          ))}
        </div>
        <p className="text-zinc-600 text-xs mt-2">Private → Institution → Faculty → Placement Cell → Admission Officers → Public (most visible)</p>
      </div>

      {/* Field visibility controls */}
      <div className="glass rounded-2xl divide-y divide-white/5">
        {FIELDS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between p-4 gap-4">
            <div className="flex-1">
              <p className="text-white text-sm font-medium">{label}</p>
              <p className="text-zinc-600 text-xs mt-0.5">{description}</p>
            </div>
            <PrivacyBadge
              value={(local[key] as VisibilityLevel) || 'institution'}
              onChange={(val) => set(key, val)}
              size="md"
            />
          </div>
        ))}

        {/* Public profile toggle */}
        <div className="flex items-center justify-between p-4">
          <div className="flex-1">
            <p className="text-white text-sm font-medium">Public Portfolio Link</p>
            <p className="text-zinc-600 text-xs mt-0.5">Generate a shareable public link to your portfolio</p>
          </div>
          <button
            onClick={() => set('profile_public_link', !local.profile_public_link)}
            className={`relative w-12 h-6 rounded-full transition-colors ${local.profile_public_link ? 'bg-purple-600' : 'bg-white/10'}`}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${local.profile_public_link ? 'left-6' : 'left-0.5'}`} />
          </button>
        </div>
      </div>
    </motion.div>
  )
}
