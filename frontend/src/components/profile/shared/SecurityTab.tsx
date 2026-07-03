import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Eye, EyeOff, Lock, CheckCircle, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

const API_BASE = 'http://localhost:8000'

function apiFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token')
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers }
  })
}

const INPUT_CLASS = 'w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all'

interface PasswordFieldProps {
  label: string; value: string; onChange: (v: string) => void; show: boolean; onToggle: () => void
}
function PasswordField({ label, value, onChange, show, onToggle }: PasswordFieldProps) {
  return (
    <div className="relative">
      <label className="block text-zinc-400 text-xs font-medium mb-1.5">{label}</label>
      <input type={show ? 'text' : 'password'} className={INPUT_CLASS} value={value}
        onChange={e => onChange(e.target.value)} placeholder="••••••••" />
      <button type="button" onClick={onToggle}
        className="absolute right-3 top-8 text-zinc-500 hover:text-zinc-300 transition-colors">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'Contains a number', ok: /\d/.test(password) },
    { label: 'Contains uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'Contains special character', ok: /[^a-zA-Z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const colors = ['', 'bg-red-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500']

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[1,2,3,4].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300
            ${i <= score ? colors[score] : 'bg-white/10'}`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(({ label, ok }) => (
          <div key={label} className="flex items-center gap-1.5">
            {ok ? <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                : <AlertCircle className="w-3 h-3 text-zinc-600 flex-shrink-0" />}
            <span className={`text-xs ${ok ? 'text-emerald-400' : 'text-zinc-600'}`}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function SecurityTab() {
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState({ current: false, new: false, confirm: false })
  const [saving, setSaving] = useState(false)

  const handleChangePassword = async () => {
    if (!current || !newPw || !confirm) { toast.error('Please fill all fields'); return }
    if (newPw !== confirm) { toast.error('Passwords do not match'); return }
    if (newPw.length < 8) { toast.error('Password must be at least 8 characters'); return }
    if (!/\d/.test(newPw)) { toast.error('Password must contain at least one number'); return }

    setSaving(true)
    try {
      const res = await apiFetch('/api/student/password', {
        method: 'PUT',
        body: JSON.stringify({ current_password: current, new_password: newPw, confirm_password: confirm })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Failed')
      toast.success('Password changed successfully!')
      setCurrent(''); setNewPw(''); setConfirm('')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to change password')
    } finally { setSaving(false) }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <h2 className="text-white text-lg font-bold">Security Settings</h2>

      {/* Change Password */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center">
            <Lock className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Change Password</h3>
            <p className="text-zinc-500 text-xs">Use a strong password to protect your account</p>
          </div>
        </div>

        <div className="max-w-md space-y-4">
          <PasswordField label="Current Password" value={current} onChange={setCurrent}
            show={show.current} onToggle={() => setShow(s => ({ ...s, current: !s.current }))} />
          <PasswordField label="New Password" value={newPw} onChange={setNewPw}
            show={show.new} onToggle={() => setShow(s => ({ ...s, new: !s.new }))} />
          {newPw && <PasswordStrength password={newPw} />}
          <PasswordField label="Confirm New Password" value={confirm} onChange={setConfirm}
            show={show.confirm} onToggle={() => setShow(s => ({ ...s, confirm: !s.confirm }))} />

          <button onClick={handleChangePassword} disabled={saving}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-purple-600 via-pink-500 to-purple-500
                       text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 mt-2">
            {saving ? 'Changing...' : 'Update Password'}
          </button>
        </div>
      </div>

      {/* Account Security Info */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-cyan-400" />
          </div>
          <h3 className="text-white font-semibold">Account Security</h3>
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between py-3 border-b border-white/5">
            <div>
              <p className="text-white text-sm font-medium">Two-Factor Authentication</p>
              <p className="text-zinc-500 text-xs">Add an extra layer of security</p>
            </div>
            <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs">Coming Soon</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-white text-sm font-medium">Active Sessions</p>
              <p className="text-zinc-500 text-xs">Manage where you're signed in</p>
            </div>
            <span className="px-2 py-1 rounded-lg bg-zinc-800 text-zinc-400 text-xs">Coming Soon</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
