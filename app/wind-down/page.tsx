'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Moon, Clock, Star, Sunrise } from 'lucide-react'
import { useWindDown } from '@/hooks/useWindDown'
import type { BriefingItem } from '@/types/proactive'

function getCurrentTime(): string {
  const now = new Date()
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function ItemIcon({ type }: { type: BriefingItem['type'] }) {
  if (type === 'daily_win') return <Star className="w-4 h-4 text-yellow-400 opacity-70" />
  if (type === 'tomorrow_prep') return <Clock className="w-4 h-4 text-blue-300 opacity-60" />
  if (type === 'sleep_nudge') return <Moon className="w-4 h-4 text-indigo-300 opacity-60" />
  if (type === 'gratitude_prompt') return <Sunrise className="w-4 h-4 text-rose-300 opacity-60" />
  return <div className="w-4 h-4 rounded-full bg-white opacity-20" />
}

function ReflectionCard({ item }: { item: BriefingItem }) {
  const isGratitude = item.type === 'gratitude_prompt'
  const isSleepNudge = item.type === 'sleep_nudge'

  return (
    <div
      className={[
        'rounded-2xl px-5 py-4 transition-opacity',
        isGratitude ? 'text-center py-6' : '',
        isSleepNudge ? 'opacity-70' : 'opacity-90',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        background: isSleepNudge
          ? 'rgba(255,255,255,0.04)'
          : 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className={`flex items-start gap-3 ${isGratitude ? 'justify-center' : ''}`}>
        <div className="mt-0.5 shrink-0">
          <ItemIcon type={item.type} />
        </div>
        <p
          className={`text-white leading-relaxed ${isGratitude ? 'text-base font-light' : 'text-sm font-light'}`}
          style={{ letterSpacing: '0.01em' }}
        >
          {item.message}
        </p>
      </div>
    </div>
  )
}

export default function WindDownPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const { reflection, isLoading, markDelivered } = useWindDown()
  const [currentTime, setCurrentTime] = useState(getCurrentTime())
  const [isPlayingTTS, setIsPlayingTTS] = useState(false)

  // Redirect unauthenticated users
  useEffect(() => {
    if (isLoaded && !user) {
      router.replace('/sign-in')
    }
  }, [isLoaded, user, router])

  // Update clock every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(getCurrentTime()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Mark delivered after 2 seconds if reflection exists
  useEffect(() => {
    if (!reflection) return
    const timer = setTimeout(() => markDelivered(), 2000)
    return () => clearTimeout(timer)
  }, [reflection, markDelivered])

  const handlePlayReflection = useCallback(async () => {
    if (!reflection || reflection.items.length === 0 || isPlayingTTS) return

    const text = reflection.items.map((i) => i.message).join('. ')
    setIsPlayingTTS(true)

    try {
      const res = await fetch('/api/v1/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) return

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = () => {
        setIsPlayingTTS(false)
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setIsPlayingTTS(false)
        URL.revokeObjectURL(url)
      }
      audio.play().catch(() => setIsPlayingTTS(false))
    } catch {
      setIsPlayingTTS(false)
    }
  }, [reflection, isPlayingTTS])

  if (!isLoaded || !user) return null

  // Sort items: daily_win and gratitude_prompt first, sleep_nudge last
  const sortedItems = reflection
    ? [...reflection.items].sort((a, b) => {
        const order: Record<string, number> = {
          daily_win: 0,
          gratitude_prompt: 1,
          tomorrow_prep: 2,
          habit_check: 3,
          goal_nudge: 4,
          sleep_nudge: 5,
        }
        return (order[a.type] ?? 3) - (order[b.type] ?? 3)
      })
    : []

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-12"
      style={{
        background: '#000000',
        fontFamily: 'var(--font-inter), system-ui, sans-serif',
      }}
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <Moon className="w-8 h-8 text-indigo-300 opacity-60 mb-4" />
          <h1 className="text-2xl font-light text-white tracking-wide mb-1">
            Good night
          </h1>
          <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {currentTime}
          </p>
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div
              className="w-5 h-5 rounded-full border border-white opacity-20 animate-pulse"
            />
          </div>
        )}

        {!isLoading && (!reflection || reflection.items.length === 0) && (
          <p
            className="text-center text-sm font-light leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            Nothing to reflect on yet — start talking to missi during the day.
          </p>
        )}

        {!isLoading && reflection && reflection.items.length > 0 && (
          <>
            <div className="flex flex-col gap-3 mb-8">
              {sortedItems.map((item, idx) => (
                <ReflectionCard key={`${item.type}-${idx}`} item={item} />
              ))}
            </div>

            <div className="flex justify-center">
              <button
                onClick={handlePlayReflection}
                disabled={isPlayingTTS}
                className="flex items-center gap-2 px-6 py-3 rounded-full text-sm font-light transition-opacity"
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: isPlayingTTS ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.7)',
                  cursor: isPlayingTTS ? 'default' : 'pointer',
                  letterSpacing: '0.03em',
                }}
              >
                <Moon className="w-3.5 h-3.5" />
                {isPlayingTTS ? 'Playing…' : 'Play reflection'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
