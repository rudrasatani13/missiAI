'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Moon, Clock, Star, Sunrise } from 'lucide-react'
import { useWindDown } from '@/hooks/useWindDown'
import type { BriefingItem } from '@/types/proactive'
import SleepSessions from '@/components/wind-down/SleepSessions'
import { ChatShell } from '@/components/shell/ChatShell'

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
        'rounded-xl px-5 py-4',
        isGratitude ? 'text-center py-5' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        opacity: isSleepNudge ? 0.6 : 1,
      }}
    >
      <div className={`flex items-start gap-3 ${isGratitude ? 'justify-center' : ''}`}>
        <div className="mt-0.5 shrink-0">
          <ItemIcon type={item.type} />
        </div>
        <p
          className={`leading-relaxed ${isGratitude ? 'text-[15px] font-light' : 'text-sm font-light'}`}
          style={{ color: 'rgba(255,255,255,0.8)' }}
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
        body: JSON.stringify({ text }),
      })

      if (!res.ok) return

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
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
    <ChatShell>
      <div
        className="relative min-h-full flex flex-col items-center justify-start px-4"
        style={{
          fontFamily: 'var(--font-body)',
          paddingTop: '2rem',
          paddingBottom: '3rem',
        }}
      >
        {/* Ambient field — soft rose (wind-down palette). Absolute so it stays
            inside the rounded main card. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background: 'radial-gradient(500px circle at 20% 15%, rgba(251,113,133,0.06), transparent 60%), radial-gradient(380px circle at 80% 85%, rgba(244,63,94,0.04), transparent 65%)',
            filter: 'blur(100px)',
          }}
        />

        <div className="w-full max-w-6xl relative z-10 flex flex-col h-full">
          {/* Sidebar provides navigation — no Back link needed. */}

          {/* Header */}
        <div className="flex flex-col items-center mb-8 md:mb-10">
          <Moon className="w-6 h-6 md:w-7 md:h-7 mb-4 md:mb-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
          <h1
            className="text-[28px] md:text-[40px] font-light text-white mb-2 md:mb-3"
            style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}
          >
            Good night
          </h1>
          <p
            className="text-[10px] font-semibold uppercase"
            style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}
          >
            {currentTime}
          </p>
        </div>

        {/* Content Layout - Two Glass Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-8 items-stretch w-full mb-12 md:mb-16">

          {/* LEFT COLUMN: Evaluation & Reflection */}
          <div
            className="flex flex-col w-full rounded-2xl p-4 sm:p-6 lg:p-9"
            style={{
              background: 'rgba(20,20,26,0.55)',
              backdropFilter: 'blur(24px) saturate(140%)',
              WebkitBackdropFilter: 'blur(24px) saturate(140%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
             <div className="flex flex-col items-start mb-7">
               <p
                 className="mb-2 text-[10px] font-semibold uppercase"
                 style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}
               >
                 Evening Reflection
               </p>
               <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
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
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-medium transition-colors active:scale-[0.97]"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  color: isPlayingTTS ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.6)',
                  cursor: isPlayingTTS ? 'default' : 'pointer',
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
          <div
            className="flex flex-col w-full rounded-2xl p-4 sm:p-6 lg:p-9"
            style={{
              background: 'rgba(20,20,26,0.55)',
              backdropFilter: 'blur(24px) saturate(140%)',
              WebkitBackdropFilter: 'blur(24px) saturate(140%)',
              border: '1px solid rgba(255,255,255,0.08)',
              boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
            }}
          >
            <SleepSessions />
          </div>

        </div>
        </div>
      </div>
    </ChatShell>
  )
}
