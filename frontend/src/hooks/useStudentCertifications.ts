import { useState, useEffect, useCallback } from 'react'
import { StudentCertification, CreateCertificationRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentCertifications() {
  const [certifications, setCertifications] = useState<StudentCertification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchCertifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/certifications')
      if (!res.ok) throw new Error()
      setCertifications(await res.json())
    } catch { setCertifications([]) } finally { setLoading(false) }
  }, [])

  const addCertification = useCallback(async (data: CreateCertificationRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/certifications', { method: 'POST', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchCertifications()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchCertifications])

  const updateCertification = useCallback(async (id: string, data: CreateCertificationRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/student/certifications/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchCertifications()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchCertifications])

  const deleteCertification = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/student/certifications/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setCertifications(prev => prev.filter(c => c.id !== id))
      return { success: true }
    } catch { return { success: false } }
  }, [])

  useEffect(() => { fetchCertifications() }, [fetchCertifications])
  return { certifications, loading, saving, fetchCertifications, addCertification, updateCertification, deleteCertification }
}
