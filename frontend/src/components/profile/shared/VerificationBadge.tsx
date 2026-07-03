import React from 'react'

interface VerificationBadgeProps {
  status: 'pending' | 'verified' | 'rejected'
  reviewComments?: string
  rejectionReason?: string
  verifiedAt?: string
  size?: 'sm' | 'md'
}

const config = {
  pending:  { label: 'Pending Review', bg: 'bg-yellow-500/15', text: 'text-yellow-400', dot: 'bg-yellow-400', border: 'border-yellow-500/20' },
  verified: { label: 'Verified',       bg: 'bg-emerald-500/15', text: 'text-emerald-400', dot: 'bg-emerald-400', border: 'border-emerald-500/20' },
  rejected: { label: 'Rejected',       bg: 'bg-red-500/15',     text: 'text-red-400',     dot: 'bg-red-400',    border: 'border-red-500/20' },
}

export default function VerificationBadge({ status, reviewComments, rejectionReason, verifiedAt, size = 'sm' }: VerificationBadgeProps) {
  const c = config[status]
  const pad = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <div className="flex flex-col gap-1">
      <span className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${pad} ${c.bg} ${c.text} ${c.border}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === 'pending' ? 'animate-pulse' : ''}`} />
        {c.label}
      </span>
      {status === 'verified' && verifiedAt && (
        <p className="text-zinc-600 text-xs">Verified {new Date(verifiedAt).toLocaleDateString()}</p>
      )}
      {status === 'rejected' && rejectionReason && (
        <p className="text-red-400/70 text-xs">{rejectionReason}</p>
      )}
      {status === 'pending' && reviewComments && (
        <p className="text-zinc-500 text-xs italic">{reviewComments}</p>
      )}
    </div>
  )
}
