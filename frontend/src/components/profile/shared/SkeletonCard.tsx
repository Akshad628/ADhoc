import React from 'react'
import { motion } from 'framer-motion'

interface SkeletonCardProps {
  rows?: number
  height?: number
  className?: string
}

export default function SkeletonCard({ rows = 3, height = 120, className = '' }: SkeletonCardProps) {
  return (
    <div className={`glass rounded-2xl p-5 ${className}`}>
      <div className="animate-pulse space-y-3">
        <div className="h-4 bg-white/10 rounded-lg w-1/3" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-3 bg-white/5 rounded-lg" style={{ width: `${85 - i * 10}%` }} />
        ))}
        <div className="h-8 bg-white/5 rounded-xl mt-4" style={{ height }} />
      </div>
    </div>
  )
}

export function SkeletonRow({ count = 4 }: { count?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
          className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02]"
        >
          <div className="w-10 h-10 rounded-xl bg-white/10 flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 bg-white/10 rounded w-2/5" />
            <div className="h-2.5 bg-white/5 rounded w-3/5" />
          </div>
          <div className="h-6 w-16 bg-white/5 rounded-full" />
        </motion.div>
      ))}
    </div>
  )
}
