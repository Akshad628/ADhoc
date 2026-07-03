import { useState, useEffect, useCallback } from 'react'
import { StudentSkills, UpdateSkillsRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentSkills() {
  const [skills, setSkills] = useState<StudentSkills | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSkills = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/skills')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSkills(Object.keys(data).length ? data : null)
    } catch { setSkills(null) } finally { setLoading(false) }
  }, [])

  const updateSkills = useCallback(async (data: UpdateSkillsRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/skills', { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      const result = await res.json()
      setSkills(result.data)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [])

  useEffect(() => { fetchSkills() }, [fetchSkills])
  return { skills, loading, saving, fetchSkills, updateSkills }
}
