import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, User, MapPin, Phone, Users } from 'lucide-react'
import toast from 'react-hot-toast'
import { FullStudentProfile, UpdateProfileRequest } from '../../../types/profile.types'

interface PersonalInfoTabProps {
  profile: FullStudentProfile
  onUpdate: (data: UpdateProfileRequest) => Promise<{ success: boolean; error?: string }>
  saving: boolean
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'
const LABEL_CLASS = 'block text-zinc-400 text-xs font-medium mb-1.5'

export default function PersonalInfoTab({ profile, onUpdate, saving }: PersonalInfoTabProps) {
  const sp = profile.profile
  const [form, setForm] = useState({
    date_of_birth: sp?.date_of_birth?.split('T')[0] || '',
    gender: sp?.gender || '',
    nationality: sp?.nationality || 'Indian',
    category: sp?.category || '',
    aadhaar_number: sp?.aadhaar_number || '',
    pan_number: sp?.pan_number || '',
    passport_number: sp?.passport_number || '',
    address_line1: sp?.address_line1 || '',
    address_line2: sp?.address_line2 || '',
    city: sp?.city || '',
    state: sp?.state || '',
    district: sp?.district || '',
    pincode: sp?.pincode || '',
    alternate_phone: sp?.alternate_phone || '',
    parent_name: sp?.parent_name || '',
    parent_phone: sp?.parent_phone || '',
    parent_email: sp?.parent_email || '',
    guardian_name: sp?.guardian_name || '',
    current_institution: sp?.current_institution || '',
    department: sp?.department || '',
    current_year: sp?.current_year?.toString() || '',
    current_semester: sp?.current_semester?.toString() || '',
  })

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    const payload: UpdateProfileRequest = {
      ...form,
      current_year: form.current_year ? parseInt(form.current_year) : undefined,
      current_semester: form.current_semester ? parseInt(form.current_semester) : undefined,
    }
    const result = await onUpdate(payload)
    if (result.success) toast.success('Profile updated successfully')
    else toast.error(result.error || 'Failed to save')
  }

  const Section = ({ title, icon: Icon, children }: { title: string; icon: typeof User; children: React.ReactNode }) => (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center">
          <Icon className="w-4 h-4 text-purple-400" />
        </div>
        <h3 className="text-white font-semibold text-sm">{title}</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  )

  const Field = ({ label, name, type = 'text', opts }: { label: string; name: string; type?: string; opts?: string[] }) => (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      {opts ? (
        <select className={INPUT_CLASS} value={form[name as keyof typeof form]} onChange={e => set(name, e.target.value)}>
          <option value="">Select {label}</option>
          {opts.map(o => <option key={o} value={o} className="bg-[#1a1a2e]">{o}</option>)}
        </select>
      ) : (
        <input type={type} className={INPUT_CLASS} value={form[name as keyof typeof form]}
          onChange={e => set(name, e.target.value)} placeholder={label} />
      )}
    </div>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-white text-lg font-bold">Personal Information</h2>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500
                     text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <Section title="Personal Details" icon={User}>
        <Field label="Date of Birth" name="date_of_birth" type="date" />
        <Field label="Gender" name="gender" opts={['Male','Female','Other','Prefer not to say']} />
        <Field label="Nationality" name="nationality" />
        <Field label="Category" name="category" opts={['General','OBC','SC','ST','EWS']} />
        <Field label="Aadhaar Number" name="aadhaar_number" />
        <Field label="PAN Number" name="pan_number" />
        <Field label="Passport Number" name="passport_number" />
      </Section>

      <Section title="Address" icon={MapPin}>
        <div className="md:col-span-2"><Field label="Address Line 1" name="address_line1" /></div>
        <div className="md:col-span-2"><Field label="Address Line 2" name="address_line2" /></div>
        <Field label="City" name="city" />
        <Field label="District" name="district" />
        <Field label="State" name="state" opts={['Andhra Pradesh','Telangana','Karnataka','Tamil Nadu','Maharashtra','Delhi','Gujarat','Rajasthan','Uttar Pradesh','West Bengal','Other']} />
        <Field label="Pincode" name="pincode" />
        <Field label="Alternate Phone" name="alternate_phone" type="tel" />
      </Section>

      <Section title="Emergency Contact" icon={Phone}>
        <Field label="Parent / Guardian Name" name="parent_name" />
        <Field label="Parent Phone" name="parent_phone" type="tel" />
        <Field label="Parent Email" name="parent_email" type="email" />
        <Field label="Guardian Name (if different)" name="guardian_name" />
      </Section>

      <Section title="Current Academic Status" icon={Users}>
        <div className="md:col-span-2"><Field label="Current Institution" name="current_institution" /></div>
        <Field label="Department / Branch" name="department" />
        <Field label="Current Year" name="current_year" opts={['1','2','3','4']} />
        <Field label="Current Semester" name="current_semester" opts={['1','2','3','4','5','6','7','8']} />
      </Section>
    </motion.div>
  )
}
