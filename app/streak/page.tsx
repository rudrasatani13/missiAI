'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Flame, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useStreak } from '@/hooks/useStreak'
import type { HabitStreak } from '@/types/gamification'

function XPBar({ totalXP }: { totalXP: number }) {
  const progress = totalXP % 100
  return (
    <div
      className="w-full rounded-full overflow-hidden"
      style={{ height: 4, background: 'rgba(255,255,255,0.08)' }}
    >
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{
          width: `${progress}%`,
          background: 'rgba(255,255,255,0.85)',
        }}
      />
    </div>
  )
}

interface HabitCardProps {
  streak: HabitStreak
  onCheckIn: (nodeId: string, title: string) => void
  isCheckedInToday: boolean
}

function HabitCard({ streak, onCheckIn, isCheckedInToday }: HabitCardProps) {
  const today = new Date().toISOString().slice(0, 10)
  const done = isCheckedInToday || streak.lastCheckedIn === today

  return (
    <div
      className="rounded-2xl px-5 py-4"
      style={{
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-light leading-snug truncate">
            {streak.title}
          </p>
          <div className="flex items-center gap-3 mt-2">
            <span
              className="flex items-center gap-1 text-xs font-light"
              style={{ color: streak.currentStreak > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)' }}
            >
              <Flame className="w-3 h-3" />
              {streak.currentStreak > 0 ? `${streak.currentStreak} days` : 'No streak'}
            </span>
            {streak.longestStreak > 0 && (
              <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Best: {streak.longestStreak}
              </span>
            )}
          </div>
        </div>
        {done ? (
          <span className="shrink-0 text-xs font-light" style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.02em' }}>
            Done ✓
          </span>
        ) : (
          <button
            onClick={() => onCheckIn(streak.nodeId, streak.title)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-light transition-opacity"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              letterSpacing: '0.02em',
            }}
          >
            {streak.currentStreak === 0 ? 'Start streak' : 'Check in'}
          </button>
        )}
      </div>
    </div>
  )
}

interface MilestoneOverlayProps {
  text: string
  onClose: () => void
  onPlay: () => void
  isPlaying: boolean
}

function MilestoneOverlay({ text, onClose, onPlay, isPlaying }: MilestoneOverlayProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl px-8 py-10 text-center"
        style={{
          background: '#050505',
          border: '1px solid rgba(255,255,255,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center mb-4">
          <Flame className="w-10 h-10" style={{ color: 'rgba(255,255,255,0.9)' }} />
        </div>
        <p className="text-white text-base font-light leading-relaxed mb-6">
          {text}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onPlay}
            disabled={isPlaying}
            className="px-5 py-2 rounded-full text-xs font-light transition-opacity"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: isPlaying ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.9)',
              cursor: isPlaying ? 'default' : 'pointer',
              letterSpacing: '0.03em',
            }}
          >
            {isPlaying ? 'Playing…' : 'Play it'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-full text-xs font-light"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              letterSpacing: '0.03em',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StreakPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const { data, isLoading, lastResult, checkIn } = useStreak()
  const [checkedInToday, setCheckedInToday] = useState<Set<string>>(new Set())
  const [showMilestone, setShowMilestone] = useState(false)
  const [isPlayingTTS, setIsPlayingTTS] = useState(false)
  const celebrationRef = useRef<string | null>(null)

  // Redirect unauthenticated users
  useEffect(() => {
    if (isLoaded && !user) {
      router.replace('/sign-in')
    }
  }, [isLoaded, user, router])

  // Show milestone overlay when a milestone result arrives
  useEffect(() => {
    if (lastResult?.milestone && lastResult.celebrationText) {
      celebrationRef.current = lastResult.celebrationText
      setShowMilestone(true)
    }
  }, [lastResult])

  const handleCheckIn = useCallback(
    async (nodeId: string, title: string) => {
      const result = await checkIn(nodeId, title)
      if (result && !result.alreadyCheckedIn) {
        setCheckedInToday((prev) => new Set(prev).add(nodeId))
      }
    },
    [checkIn],
  )

  const handlePlayCelebration = useCallback(async () => {
    const text = celebrationRef.current
    if (!text || isPlayingTTS) return
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
      audio.onended = () => { setIsPlayingTTS(false); URL.revokeObjectURL(url) }
      audio.onerror = () => { setIsPlayingTTS(false); URL.revokeObjectURL(url) }
      audio.play().catch(() => setIsPlayingTTS(false))
    } catch {
      setIsPlayingTTS(false)
    }
  }, [isPlayingTTS])

  if (!isLoaded || !user) return null

  const level = data?.level ?? 1
  const totalXP = data?.totalXP ?? 0
  const habits = data?.habits ?? []

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-12"
      style={{
        background: '#000000',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div className="w-full max-w-md">
        {/* Back link */}
        <Link
          href="/chat"
          className="flex items-center gap-2 mb-8 opacity-40 hover:opacity-70 transition-opacity"
          style={{ color: 'white', textDecoration: 'none' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-light tracking-wide">Back</span>
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-light text-white tracking-wide">Your streaks</h1>
          </div>
          <div
            className="px-3 py-1 rounded-full text-xs font-light"
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.7)',
              letterSpacing: '0.04em',
            }}
          >
            Level {level}
          </div>
        </div>

        {/* XP info */}
        <p className="text-xs font-light mb-3" style={{ color: 'rgba(255,255,255,0.3)' }}>
          {totalXP} XP · {100 - (totalXP % 100)} XP to next level
        </p>
        <div className="mb-8">
          <XPBar totalXP={totalXP} />
        </div>

        {/* Content */}
        {isLoading && (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 rounded-full border border-white opacity-20 animate-pulse" />
          </div>
        )}

        {!isLoading && habits.length === 0 && (
          <p
            className="text-center text-sm font-light leading-relaxed"
            style={{ color: 'rgba(255,255,255,0.35)' }}
          >
            No habits tracked yet. Tell missi about a habit you want to build.
          </p>
        )}

        {!isLoading && habits.length > 0 && (
          <div className="flex flex-col gap-3">
            {habits.map((streak) => (
              <HabitCard
                key={streak.nodeId}
                streak={streak}
                onCheckIn={handleCheckIn}
                isCheckedInToday={checkedInToday.has(streak.nodeId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Milestone celebration overlay */}
      {showMilestone && celebrationRef.current && (
        <MilestoneOverlay
          text={celebrationRef.current}
          onClose={() => setShowMilestone(false)}
          onPlay={handlePlayCelebration}
          isPlaying={isPlayingTTS}
        />
      )}
    </div>
  )
}
