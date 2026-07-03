import React from 'react'
import { motion } from 'framer-motion'
import { Sparkles, RefreshCw, AlertCircle, BookOpen, Award, TrendingUp, FileText, Zap, GraduationCap } from 'lucide-react'
import { useAIInsights } from '../../../hooks/useAIInsights'
import SkeletonCard from '../shared/SkeletonCard'

interface ScoreRingProps { score: number; label: string }
function ScoreRing({ score, label }: ScoreRingProps) {
  const r = 38, c = 2 * Math.PI * r
  const offset = c - (score / 100) * c
  const color = score >= 75 ? '#10b981' : score >= 50 ? '#a855f7' : '#f59e0b'
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <svg width="96" height="96" className="-rotate-90">
          <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" />
          <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1.2s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-white font-bold text-lg leading-none">{score}</span>
          <span className="text-zinc-500 text-xs">/100</span>
        </div>
      </div>
      <span className="text-zinc-400 text-xs text-center">{label}</span>
    </div>
  )
}

export default function AIInsightsTab({ onRefresh, refreshing }: { onRefresh: () => void; refreshing: boolean }) {
  const { insights, loading } = useAIInsights()

  if (loading) return <SkeletonCard rows={8} height={300} />

  const status = insights?.analysis_status

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-400" />
          <h2 className="text-white text-lg font-bold">AI Profile Insights</h2>
        </div>
        <div className="flex items-center gap-3">
          {insights?.generated_at && (
            <span className="text-zinc-600 text-xs">
              Updated: {new Date(insights.generated_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          )}
          <button onClick={onRefresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600/20 to-cyan-500/20 border border-purple-500/25 text-purple-400 text-sm font-medium hover:from-purple-600/30 hover:to-cyan-500/30 transition-all disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Analyzing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {status === 'generating' && (
        <div className="glass rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-3xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
          </div>
          <h3 className="text-white font-semibold mb-2">AI is analyzing your profile...</h3>
          <p className="text-zinc-500 text-sm">This usually takes 10–30 seconds. The page will update automatically.</p>
          <div className="mt-4 h-1 bg-white/5 rounded-full overflow-hidden max-w-xs mx-auto">
            <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}

      {status === 'failed' && (
        <div className="glass rounded-2xl p-6 border border-red-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-white font-medium">Analysis failed</p>
              <p className="text-zinc-500 text-sm">Please try refreshing the insights.</p>
            </div>
          </div>
        </div>
      )}

      {(status === 'ready' || (status !== 'generating' && insights)) && (
        <>
          {/* Scores row */}
          <div className="glass rounded-2xl p-6">
            <h3 className="text-white font-semibold mb-4 text-sm">Portfolio Scores</h3>
            <div className="flex flex-wrap items-center justify-center gap-8">
              <ScoreRing score={insights?.profile_strength || 0} label="Profile Strength" />
              {insights?.ats_score != null && <ScoreRing score={insights.ats_score} label="ATS Score" />}
            </div>
            {insights?.analysis_summary && (
              <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/5">
                <p className="text-zinc-300 text-sm leading-relaxed">{insights.analysis_summary}</p>
              </div>
            )}
          </div>

          {/* Missing Documents */}
          {insights?.missing_documents && insights.missing_documents.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <FileText className="w-4 h-4 text-amber-400" />Missing Documents
              </h3>
              <div className="space-y-2">
                {insights.missing_documents.map((doc, i) => {
                  const priorityColor = doc.priority === 'high' ? 'text-red-400 border-red-500/20 bg-red-500/5' : doc.priority === 'medium' ? 'text-amber-400 border-amber-500/20 bg-amber-500/5' : 'text-zinc-400 border-white/10 bg-white/[0.02]'
                  return (
                    <div key={i} className={`flex items-start justify-between p-3 rounded-xl border ${priorityColor}`}>
                      <div>
                        <p className="font-medium text-sm">{doc.name}</p>
                        <p className="text-xs opacity-70 mt-0.5">{doc.reason}</p>
                      </div>
                      <span className="text-xs capitalize px-2 py-0.5 rounded-full bg-white/10">{doc.priority}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Skill Gaps */}
          {insights?.skill_gaps && insights.skill_gaps.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" />Skill Gaps to Address
              </h3>
              <div className="space-y-3">
                {insights.skill_gaps.map((gap, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white font-medium text-sm">{gap.skill}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${gap.demand === 'high' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {gap.demand} demand
                      </span>
                    </div>
                    {gap.suggested_courses?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {gap.suggested_courses.map(c => (
                          <span key={c} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Career Suggestions */}
          {insights?.career_suggestions && insights.career_suggestions.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />Career Suggestions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {insights.career_suggestions.map((sug, i) => (
                  <div key={i} className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 capitalize">
                        {sug.type}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium">{sug.title}</p>
                    <p className="text-zinc-500 text-xs mt-0.5">{sug.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Scholarship Suggestions */}
          {insights?.scholarship_suggestions && insights.scholarship_suggestions.length > 0 && (
            <div className="glass rounded-2xl p-5">
              <h3 className="text-white font-semibold mb-3 text-sm flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />Scholarship Opportunities
              </h3>
              <div className="space-y-3">
                {insights.scholarship_suggestions.map((sch, i) => (
                  <div key={i} className="flex items-start justify-between p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                    <div>
                      <p className="text-white font-medium text-sm">{sch.name}</p>
                      <p className="text-emerald-400 text-xs font-semibold mt-0.5">{sch.amount}</p>
                      <p className="text-zinc-500 text-xs mt-0.5">{sch.eligibility}</p>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-emerald-400 font-bold text-sm">{sch.match_score}%</span>
                      <span className="text-zinc-600 text-xs">match</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!insights?.missing_documents?.length && !insights?.skill_gaps?.length && !insights?.career_suggestions?.length && (
            <div className="text-center py-8">
              <p className="text-zinc-500 text-sm">No insights generated yet. Click Refresh to analyze your profile.</p>
            </div>
          )}
        </>
      )}

      {!insights && status !== 'generating' && (
        <div className="glass rounded-2xl p-10 text-center">
          <div className="w-20 h-20 rounded-3xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-10 h-10 text-purple-400" />
          </div>
          <h3 className="text-white font-semibold mb-2">No AI analysis yet</h3>
          <p className="text-zinc-500 text-sm mb-4">Click "Refresh" to generate personalized insights for your profile.</p>
          <button onClick={onRefresh} disabled={refreshing}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
            Generate AI Insights
          </button>
        </div>
      )}
    </motion.div>
  )
}
