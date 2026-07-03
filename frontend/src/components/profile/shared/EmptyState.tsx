import React from 'react'
import { motion } from 'framer-motion'
import { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
  size?: 'sm' | 'md' | 'lg'
}

export default function EmptyState({ icon: Icon, title, description, action, size = 'md' }: EmptyStateProps) {
  const iconSize = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'
  const containerSize = size === 'sm' ? 'w-16 h-16' : size === 'lg' ? 'w-28 h-28' : 'w-20 h-20'
  const py = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-16' : 'py-12'

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center gap-4 text-center ${py}`}
    >
      <div className={`${containerSize} rounded-3xl bg-white/[0.03] border border-white/5 flex items-center justify-center`}>
        <Icon className={`${iconSize} text-zinc-600`} />
      </div>
      <div>
        <h3 className="text-white font-semibold text-base mb-1">{title}</h3>
        <p className="text-zinc-500 text-sm max-w-xs leading-relaxed">{description}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500
                     text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/20"
        >
          {action.label}
        </button>
      )}
    </motion.div>
  )
}
