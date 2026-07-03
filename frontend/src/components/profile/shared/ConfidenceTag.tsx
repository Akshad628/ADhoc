import React from 'react'

interface ConfidenceTagProps {
  fieldName: string
  value: string
  confidence: number  // 0.0 to 1.0
  threshold?: number  // default 0.85 — below this is flagged
}

export default function ConfidenceTag({ fieldName, value, confidence, threshold = 0.85 }: ConfidenceTagProps) {
  const pct = Math.round(confidence * 100)
  const isLow = confidence < threshold

  return (
    <div className={`flex items-center justify-between py-2 px-3 rounded-xl border transition-colors
      ${isLow ? 'bg-amber-500/5 border-amber-500/20' : 'bg-white/[0.02] border-white/5'}`}>
      <div className="flex flex-col">
        <span className="text-zinc-500 text-xs capitalize">{fieldName.replace(/_/g, ' ')}</span>
        <span className="text-white text-sm font-medium">{value || '—'}</span>
      </div>
      <div className="flex items-center gap-2">
        {/* Confidence bar */}
        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isLow ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-xs font-semibold tabular-nums ${isLow ? 'text-amber-400' : 'text-emerald-400'}`}>
          {pct}%
        </span>
        {isLow && (
          <span className="text-amber-400 text-xs" title="Low confidence — please verify manually">⚠️</span>
        )}
      </div>
    </div>
  )
}
