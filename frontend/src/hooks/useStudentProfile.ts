import { useState, useEffect, useCallback } from 'react'
import { FullStudentProfile, UpdateProfileRequest, ProfileStrength } from '../types/profile.types'
import { apiFetch } from './useApi'

export function useStudentProfile() {
  const [profile, setProfile] = useState<FullStudentProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch('/api/student/profile')
      setProfile(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }, [])

  const updateProfile = useCallback(async (updates: UpdateProfileRequest) => {
    setSaving(true)
    try {
      const data = await apiFetch('/api/student/profile', {
        method: 'PUT', body: JSON.stringify(updates)
      })
      setProfile(prev => prev ? { ...prev, profile: { ...prev.profile!, ...updates }, strength: data.strength } : prev)
      return { success: true }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Update failed' }
    } finally {
      setSaving(false)
    }
  }, [])

  const refreshStrength = useCallback(async (): Promise<ProfileStrength | null> => {
    try {
      const data = await apiFetch('/api/student/completion')
      setProfile(prev => prev ? { ...prev, strength: data } : prev)
      return data
    } catch { return null }
  }, [])

  useEffect(() => { fetchProfile() }, [fetchProfile])

  return { profile, loading, saving, error, fetchProfile, updateProfile, refreshStrength }
}
