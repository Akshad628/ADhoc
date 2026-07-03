import { useState, useEffect, useCallback } from 'react'
import { PrivacySettings, UpdatePrivacyRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentPrivacy() {
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchPrivacy = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/privacy')
      if (!res.ok) throw new Error()
      setPrivacy(await res.json())
    } catch { setPrivacy(null) } finally { setLoading(false) }
  }, [])

  const updatePrivacy = useCallback(async (data: UpdatePrivacyRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/privacy', { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      setPrivacy(result.data)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [])

  useEffect(() => { fetchPrivacy() }, [fetchPrivacy])
  return { privacy, loading, saving, fetchPrivacy, updatePrivacy }
}
