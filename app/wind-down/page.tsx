'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Moon, Clock, Star, Sunrise, ArrowLeft } from 'lucide-react'
import { useWindDown } from '@/hooks/useWindDown'
import type { BriefingItem } from '@/types/proactive'
import SleepSessions from '@/components/wind-down/SleepSessions'

function getCurrentTime(): string {
  const now = new Date()
  return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function ItemIcon({ type }: { type: BriefingItem['type'] }) {
  if (type === 'daily_win') return <Star className="w-4 h-4 text-white opacity-60" />
  if (type === 'tomorrow_prep') return <Clock className="w-4 h-4 text-white opacity-60" />
  if (type === 'sleep_nudge') return <Moon className="w-4 h-4 text-white opacity-60" />
  if (type === 'gratitude_prompt') return <Sunrise className="w-4 h-4 text-white opacity-60" />
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
          : 'rgba(255,255,255,0.08)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.12)',
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

  const hasMarkedRef = useRef(false)

  // Mark delivered after 2 seconds if reflection exists
  useEffect(() => {
    if (!reflection || hasMarkedRef.current) return
    const timer = setTimeout(() => {
      hasMarkedRef.current = true
      markDelivered()
    }, 2000)
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
        body: JSON.stringify({ text, useSleepVoice: true }),
      })

      if (!res.ok) return

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      // MOBILE FIX: preload + playsinline attributes
      audio.preload = 'auto'
      audio.setAttribute('playsinline', 'true')
      audio.setAttribute('webkit-playsinline', 'true')
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
      className="min-h-screen flex flex-col items-center justify-start px-4 py-12 relative overflow-hidden"
      style={{
        background: '#000000',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Vibrant Ambient Background Mesh for Glass Effect */}
      <div className="absolute top-[10%] left-[10%] w-[50vw] h-[50vw] max-w-[700px] max-h-[700px] bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[50vw] h-[50vw] max-w-[700px] max-h-[700px] bg-fuchsia-600/10 blur-[130px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[0%] left-1/2 -translate-x-1/2 w-[60vw] h-[40vw] max-w-[1000px] bg-blue-500/10 blur-[150px] rounded-full pointer-events-none" />
      
      <div className="w-full max-w-6xl relative z-10 flex flex-col h-full">
        {/* Back button */}
        <Link
          href="/chat"
          className="flex items-center gap-2 mb-8 opacity-40 hover:opacity-70 transition-opacity"
          style={{ color: 'white', textDecoration: 'none' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-light tracking-wide">Back</span>
        </Link>

        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <Moon className="w-8 h-8 text-white opacity-60 mb-5" />
          <h1 className="text-3xl md:text-4xl font-light text-white tracking-wide mb-2">
            Good night
          </h1>
          <p className="text-sm font-light text-white/40 tracking-widest uppercase">
            {currentTime}
          </p>
        </div>

        {/* Content Layout - Two Glass Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch w-full mb-16">
          
          {/* LEFT COLUMN: Evaluation & Reflection */}
          <div className="flex flex-col w-full bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 lg:p-10 relative overflow-hidden transform-gpu">
             {/* Inner Card Glow */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

             <div className="flex flex-col items-start mb-8">
                 <h2 className="text-2xl font-light text-white tracking-wide mb-2">Evening Reflection</h2>
                 <p className="text-sm font-light leading-relaxed text-white/40">
                   Review the highlights of your day.
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
                  background: 'rgba(255,255,255,0.08)',
                  backdropFilter: 'blur(24px)',
                  WebkitBackdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.15)',
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

          {/* RIGHT COLUMN: Sleep Sessions */}
          <div className="flex flex-col w-full bg-white/[0.03] backdrop-blur-2xl border border-white/10 rounded-[32px] p-8 lg:p-10 relative overflow-hidden transform-gpu">
             {/* Inner Card Glow */}
             <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
             <SleepSessions />
          </div>

        </div>
      </div>
    </div>
  )
}
