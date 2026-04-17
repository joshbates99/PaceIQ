'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SyncButton() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const router = useRouter()

  const handleSync = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok || data.error) {
        setMessage({ text: data.error ?? 'Sync failed', ok: false })
      } else {
        setMessage({ text: `Synced ${data.synced} run${data.synced !== 1 ? 's' : ''}`, ok: true })
        router.refresh()
      }
    } catch {
      setMessage({ text: 'Network error', ok: false })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      {message && (
        <span className={`text-sm font-medium ${message.ok ? 'text-emerald-600' : 'text-red-500'}`}>
          {message.text}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={loading}
        className="inline-flex items-center gap-2 bg-[#1A56DB] hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
      >
        <svg
          className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {loading ? 'Syncing…' : 'Sync Activities'}
      </button>
    </div>
  )
}
