import React, { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Upload, File, X, CheckCircle, AlertCircle, CloudUpload } from 'lucide-react'

interface UploadZoneProps {
  onUpload: (file: File) => Promise<{ success: boolean; error?: string }>
  accept?: string
  maxSizeMB?: number
  label?: string
  subLabel?: string
  className?: string
}

export default function UploadZone({
  onUpload, accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx',
  maxSizeMB = 10, label = 'Upload Document', subLabel = 'PDF, JPG, PNG, DOC up to 10MB',
  className = ''
}: UploadZoneProps) {
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [progress, setProgress] = useState(0)

  const handleFile = useCallback(async (file: File) => {
    if (file.size > maxSizeMB * 1024 * 1024) {
      setStatus('error')
      setMessage(`File too large. Max size is ${maxSizeMB}MB.`)
      setTimeout(() => setStatus('idle'), 3000)
      return
    }
    setUploading(true)
    setProgress(0)
    // Simulate progress
    const interval = setInterval(() => setProgress(p => Math.min(p + 10, 85)), 200)
    const result = await onUpload(file)
    clearInterval(interval)
    setProgress(100)
    setUploading(false)
    if (result.success) {
      setStatus('success')
      setMessage(`${file.name} uploaded successfully`)
    } else {
      setStatus('error')
      setMessage(result.error || 'Upload failed. Please try again.')
    }
    setTimeout(() => { setStatus('idle'); setProgress(0) }, 3000)
  }, [onUpload, maxSizeMB])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }, [handleFile])

  return (
    <div className={`relative ${className}`}>
      <label
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          flex flex-col items-center justify-center gap-3 p-8 rounded-2xl cursor-pointer
          border-2 border-dashed transition-all duration-300
          ${dragging
            ? 'border-purple-400 bg-purple-500/10 scale-[1.02]'
            : 'border-white/20 hover:border-purple-500/50 hover:bg-purple-500/5'}
          ${uploading ? 'pointer-events-none opacity-70' : ''}
        `}
      >
        <input type="file" accept={accept} className="hidden" onChange={onInputChange} />

        <AnimatePresence mode="wait">
          {status === 'success' ? (
            <motion.div key="success" initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="flex flex-col items-center gap-2">
              <CheckCircle className="w-10 h-10 text-emerald-400" />
              <p className="text-emerald-400 text-sm font-medium text-center">{message}</p>
            </motion.div>
          ) : status === 'error' ? (
            <motion.div key="error" initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="flex flex-col items-center gap-2">
              <AlertCircle className="w-10 h-10 text-red-400" />
              <p className="text-red-400 text-sm font-medium text-center">{message}</p>
            </motion.div>
          ) : uploading ? (
            <motion.div key="uploading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-3 w-full">
              <CloudUpload className="w-10 h-10 text-purple-400 animate-bounce" />
              <p className="text-zinc-400 text-sm">Uploading...</p>
              <div className="w-full bg-white/5 rounded-full h-1.5">
                <motion.div
                  className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-cyan-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center">
                <Upload className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-center">
                <p className="text-white text-sm font-medium">{label}</p>
                <p className="text-zinc-500 text-xs mt-1">Drag & drop or <span className="text-purple-400">browse</span></p>
                <p className="text-zinc-600 text-xs mt-0.5">{subLabel}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </label>
    </div>
  )
}
