import { useState, useEffect, useCallback } from 'react'
import { StudentNotification } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentNotifications() {
  const [notifications, setNotifications] = useState<StudentNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnreadCount(data.unread_count || 0)
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const markRead = useCallback(async (id: string) => {
    try {
      await apiFetch(`/api/student/notifications/${id}/read`, { method: 'PUT' })
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
    } catch { /* silent */ }
  }, [])

  const markAllRead = useCallback(async () => {
    try {
      await apiFetch('/api/student/notifications/read-all', { method: 'PUT' })
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
      setUnreadCount(0)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  return { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead }
}
