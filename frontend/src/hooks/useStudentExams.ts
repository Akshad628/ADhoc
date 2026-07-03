import { useState, useEffect, useCallback } from 'react'
import { EntranceExam, CreateEntranceExamRequest } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentExams() {
  const [exams, setExams] = useState<EntranceExam[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchExams = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/student/exams')
      if (!res.ok) throw new Error()
      setExams(await res.json())
    } catch { setExams([]) } finally { setLoading(false) }
  }, [])

  const addExam = useCallback(async (data: CreateEntranceExamRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/student/exams', { method: 'POST', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchExams()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchExams])

  const updateExam = useCallback(async (id: string, data: CreateEntranceExamRequest) => {
    setSaving(true)
    try {
      const res = await apiFetch(`/api/student/exams/${id}`, { method: 'PUT', body: JSON.stringify(data) })
      if (!res.ok) throw new Error(await res.text())
      await fetchExams()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Failed' }
    } finally { setSaving(false) }
  }, [fetchExams])

  const deleteExam = useCallback(async (id: string) => {
    try {
      const res = await apiFetch(`/api/student/exams/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setExams(prev => prev.filter(e => e.id !== id))
      return { success: true }
    } catch { return { success: false } }
  }, [])

  useEffect(() => { fetchExams() }, [fetchExams])
  return { exams, loading, saving, fetchExams, addExam, updateExam, deleteExam }
}
