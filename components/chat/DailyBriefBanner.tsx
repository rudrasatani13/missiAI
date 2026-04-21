'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { X, Sparkles } from 'lucide-react'

const isFullDevBootstrap = process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_ENABLE_CF_DEV === '1'

/**
 * DailyBriefBanner — shown at the top of the chat page when the user
 * has an unviewed daily brief. Dismissed state is persisted in localStorage
 * so it only shows once per day.
 *
 * This component is fully fire-and-forget: it never blocks the chat
 * interface from loading (all fetches are wrapped in try/catch).
 */
export function DailyBriefBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const load = async () => {
      try {
        const today = new Date().toLocaleDateString('en-CA')
        const dismissKey = `missi-brief-dismissed:${today}`

        const dismissed = localStorage.getItem(dismissKey)
        if (dismissed === 'true') return

        const res = await fetch('/api/v1/daily-brief')
        if (!res.ok || cancelled) return

        const data = await res.json()
        const brief = data?.data?.brief

        if (!cancelled && brief && brief.viewed === false) {
          setVisible(true)
        }
      } catch {
      }
    }

    if (isFullDevBootstrap) {
      void load()
    } else {
      timer = setTimeout(() => {
        void load()
      }, 4500)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    try {
      // BUGFIX (F1): Use local date for dismiss key consistency
      const today = new Date().toLocaleDateString('en-CA')
      localStorage.setItem(`missi-brief-dismissed:${today}`, 'true')
    } catch {
      // localStorage might be unavailable
    }
  }

  if (!visible) return null

  return (
    <div
      className="w-full flex items-center justify-between px-4 md:px-6 py-3 rounded-2xl mb-3 z-50"
      style={{
        background: 'rgba(251, 191, 36, 0.06)',
        border: '1px solid rgba(251, 191, 36, 0.12)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
      }}
    >
      {/* Left: message */}
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 flex-shrink-0" style={{ color: '#fbbf24' }} />
        <span
          className="text-sm font-medium"
          style={{ color: 'rgba(255,255,255,0.8)' }}
        >
          Your daily mission is ready
        </span>
      </div>

      {/* Center: view button */}
      <Link
        href="/today"
        className="text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all hover:opacity-80"
        style={{
          background: 'rgba(251, 191, 36, 0.15)',
          color: '#fbbf24',
          border: '1px solid rgba(251, 191, 36, 0.2)',
        }}
      >
        View
      </Link>

      {/* Right: dismiss */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          handleDismiss()
        }}
        className="p-1.5 rounded-full transition-all hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
