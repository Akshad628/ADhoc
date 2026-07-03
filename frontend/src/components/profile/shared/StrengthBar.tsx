import React from 'react'

interface StrengthBarProps {
  label: string
  value: number
  max?: number
  color?: 'cyan' | 'purple' | 'emerald' | 'pink' | 'amber' | 'auto'
  delay?: number
}

function getColor(value: number, max: number, color?: string) {
  if (color === 'auto') {
    const pct = (value / max) * 100
    if (pct >= 80) return 'from-emerald-500 to-cyan-400'
    if (pct >= 60) return 'from-cyan-500 to-purple-500'
    if (pct >= 40) return 'from-purple-500 to-pink-500'
    return 'from-amber-500 to-orange-500'
  }
  const map: Record<string, string> = {
    cyan: 'from-cyan-500 to-cyan-400',
    purple: 'from-purple-600 to-purple-400',
    emerald: 'from-emerald-600 to-emerald-400',
    pink: 'from-pink-600 to-pink-400',
    amber: 'from-amber-600 to-amber-400',
  }
  return map[color || 'purple'] || 'from-purple-600 to-cyan-400'
}

export default function StrengthBar({ label, value, max = 100, color = 'auto', delay = 0 }: StrengthBarProps) {
  const pct = Math.min(Math.round((value / max) * 100), 100)
  const gradClass = getColor(value, max, color)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-zinc-400 text-sm">{label}</span>
        <span className="text-white text-sm font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="h-2 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradClass} transition-all duration-1000`}
          style={{
            width: `${pct}%`,
            transitionDelay: `${delay}ms`,
            boxShadow: `0 0 8px rgba(168,85,247,0.4)`
          }}
        />
      </div>
    </div>
  )
}
