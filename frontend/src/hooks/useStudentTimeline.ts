import { useState, useEffect, useCallback } from 'react'
import { TimelineEvent } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentTimeline() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const fetchTimeline = useCallback(async (pageNum = 1) => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/student/timeline?page=${pageNum}&limit=20`)
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (pageNum === 1) {
        setEvents(data.events || [])
      } else {
        setEvents(prev => [...prev, ...(data.events || [])])
      }
      setHasMore((data.events || []).length === 20)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const loadMore = useCallback(() => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchTimeline(nextPage)
  }, [page, fetchTimeline])

  useEffect(() => { fetchTimeline(1) }, [fetchTimeline])
  return { events, loading, hasMore, loadMore, fetchTimeline }
}
