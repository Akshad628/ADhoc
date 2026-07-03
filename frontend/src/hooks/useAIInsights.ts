import { useState, useEffect, useCallback } from 'react'
import { AIInsights, AnalysisStatus } from '../types/profile.types'
import { apiFetch } from './useApi'

export function useAIInsights() {
  const [insights, setInsights] = useState<AIInsights | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/student/ai-insights')
      setInsights(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights')
    } finally { setLoading(false) }
  }, [])

  const refreshInsights = useCallback(async () => {
    setRefreshing(true)
    try {
      await apiFetch('/api/student/ai-insights/refresh', { method: 'POST' })
      // Poll for completion
      setInsights(prev => prev ? { ...prev, analysis_status: 'generating' as AnalysisStatus } : prev)
      const poll = setInterval(async () => {
        try {
          const data = await apiFetch('/api/student/ai-insights')
          if (data.analysis_status === 'ready' || data.analysis_status === 'failed') {
            setInsights(data)
            clearInterval(poll)
            setRefreshing(false)
          }
        } catch {
          // If polling fails, ignore or let timeout handle it
        }
      }, 3000)
      // Timeout after 60s
      setTimeout(() => { clearInterval(poll); setRefreshing(false) }, 60000)
      return { success: true }
    } catch (e: unknown) {
      setRefreshing(false)
      return { success: false, error: e instanceof Error ? e.message : 'Refresh failed' }
    }
  }, [])

  useEffect(() => { fetchInsights() }, [fetchInsights])

  return { insights, loading, refreshing, error, fetchInsights, refreshInsights }
}
