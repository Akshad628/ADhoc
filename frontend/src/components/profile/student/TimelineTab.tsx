import React from 'react'
import { motion } from 'framer-motion'
import { Activity, ArrowRight } from 'lucide-react'
import { useStudentTimeline } from '../../../hooks/useStudentTimeline'
import EmptyState from '../shared/EmptyState'
import { SkeletonRow } from '../shared/SkeletonCard'

const EVENT_ICONS: Record<string, string> = {
  profile_created:          '🎉',
  profile_updated:          '✏️',
  document_uploaded:        '📄',
  document_replaced:        '🔄',
  academic_record_updated:  '🎓',
  semester_added:           '📊',
  certification_added:      '🏆',
  skills_updated:           '💻',
  exam_result_added:        '📝',
  achievement_added:        '⭐',
  ai_insights_generated:    '🤖',
  ai_insights_refreshed:    '🔄',
  password_changed:         '🔐',
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function TimelineTab() {
  const { events, loading, hasMore, loadMore } = useStudentTimeline()

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-white text-lg font-bold">Academic Journey Timeline</h2>
      <p className="text-zinc-500 text-sm">An immutable, chronological record of your academic portfolio activity.</p>

      {loading ? <SkeletonRow count={6} /> : events.length === 0 ? (
        <EmptyState icon={Activity} title="No timeline events yet" description="Your activity will appear here as you build your portfolio" />
      ) : (
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[26px] top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/40 via-cyan-500/20 to-transparent" />

          <div className="space-y-3">
            {events.map((event, i) => (
              <motion.div key={event.id}
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-4 group">
                {/* Icon bubble */}
                <div className="relative z-10 w-[52px] flex-shrink-0 flex items-center justify-center">
                  <div className="w-9 h-9 rounded-2xl bg-[#1a1a2e] border border-white/10 flex items-center justify-center text-base
                                  group-hover:border-purple-500/30 group-hover:bg-purple-500/5 transition-all">
                    {EVENT_ICONS[event.event_type] || '📌'}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 glass rounded-2xl p-4 hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-white font-medium text-sm leading-snug">{event.title}</h4>
                    <span className="text-zinc-600 text-xs flex-shrink-0 whitespace-nowrap">{formatDate(event.created_at)}</span>
                  </div>
                  {event.description && (
                    <p className="text-zinc-500 text-xs mt-1">{event.description}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {hasMore && (
            <div className="text-center mt-4 ml-[52px]">
              <button onClick={loadMore}
                className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-zinc-400 text-sm hover:bg-white/10 transition-colors">
                Load more <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}
