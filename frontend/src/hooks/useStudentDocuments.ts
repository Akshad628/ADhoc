import { useState, useEffect, useCallback } from 'react'
import { StudentDocument } from '../types/profile.types'

const API_BASE = 'http://localhost:8000'
function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers }
  })
}

export function useStudentDocuments(category?: string) {
  const [documents, setDocuments] = useState<StudentDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = category ? `/api/student/documents?category=${category}` : '/api/student/documents'
      const res = await apiFetch(url)
      if (!res.ok) throw new Error(await res.text())
      setDocuments(await res.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load documents')
    } finally { setLoading(false) }
  }, [category])

  const uploadDocument = useCallback(async (
    file: File, documentType: string, documentName?: string
  ) => {
    setUploading(true)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)
      formData.append('document_type', documentType)
      if (documentName) formData.append('document_name', documentName)
      const res = await fetch(`${API_BASE}/api/student/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      await fetchDocuments()
      return { success: true, data: data.data }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Upload failed' }
    } finally { setUploading(false) }
  }, [fetchDocuments])

  const replaceDocument = useCallback(async (docId: string, file: File) => {
    setUploading(true)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`${API_BASE}/api/student/documents/${docId}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: formData
      })
      if (!res.ok) throw new Error(await res.text())
      await fetchDocuments()
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Replace failed' }
    } finally { setUploading(false) }
  }, [fetchDocuments])

  const deleteDocument = useCallback(async (docId: string) => {
    try {
      const res = await apiFetch(`/api/student/documents/${docId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(await res.text())
      setDocuments(prev => prev.filter(d => d.id !== docId))
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Delete failed' }
    }
  }, [])

  const getVersions = useCallback(async (docId: string): Promise<any> => {
    try {
      const res = await apiFetch(`/api/student/documents/${docId}/versions`)
      if (!res.ok) return []
      return await res.json()
    } catch { return [] }
  }, [])

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  return { documents, loading, uploading, error, fetchDocuments, uploadDocument, replaceDocument, deleteDocument, getVersions }
}
