import React from 'react'
import { VisibilityLevel } from '../../../types/profile.types'
import { Lock, Building2, GraduationCap, Briefcase, UserCheck, Globe } from 'lucide-react'

interface PrivacyBadgeProps {
  value: VisibilityLevel
  onChange?: (val: VisibilityLevel) => void
  readonly?: boolean
  size?: 'sm' | 'md'
}

const options: { value: VisibilityLevel; label: string; Icon: React.FC<{className?: string}> }[] = [
  { value: 'private',            label: 'Private',          Icon: Lock },
  { value: 'institution',        label: 'Institution',      Icon: Building2 },
  { value: 'faculty',            label: 'Faculty',          Icon: GraduationCap },
  { value: 'placement_cell',     label: 'Placement Cell',   Icon: Briefcase },
  { value: 'admission_officers', label: 'Admissions',       Icon: UserCheck },
  { value: 'public',             label: 'Public',           Icon: Globe },
]

const colorMap: Record<VisibilityLevel, string> = {
  private:            'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
  institution:        'text-blue-400 bg-blue-500/10 border-blue-500/20',
  faculty:            'text-purple-400 bg-purple-500/10 border-purple-500/20',
  placement_cell:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  admission_officers: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  public:             'text-pink-400 bg-pink-500/10 border-pink-500/20',
}

export default function PrivacyBadge({ value, onChange, readonly = false, size = 'sm' }: PrivacyBadgeProps) {
  const current = options.find(o => o.value === value) || options[1]
  const { Icon } = current
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs gap-1' : 'px-3 py-1 text-sm gap-1.5'

  if (readonly || !onChange) {
    return (
      <span className={`inline-flex items-center rounded-full border font-medium ${pad} ${colorMap[value]}`}>
        <Icon className="w-3 h-3" />
        {current.label}
      </span>
    )
  }

  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as VisibilityLevel)}
      className={`rounded-full border bg-transparent font-medium cursor-pointer outline-none
        ${pad} ${colorMap[value]} ${size === 'sm' ? 'text-xs' : 'text-sm'}`}
    >
      {options.map(o => (
        <option key={o.value} value={o.value} className="bg-[#1a1a2e] text-white">
          {o.label}
        </option>
      ))}
    </select>
  )
}
