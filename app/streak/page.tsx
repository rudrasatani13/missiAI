'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Flame, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAvatar } from '@/hooks/useAvatar'
import { useStreak } from '@/hooks/useStreak'
import { AVATAR_TIERS, type AvatarTier } from '@/types/gamification'
import { getAllAchievements } from '@/lib/gamification/achievements'
import type { HabitStreak, Achievement, GamificationData } from '@/types/gamification'

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarOrb({ tier, tierName, level }: { tier: AvatarTier; tierName: string; level: number }) {
  const tierInfo = AVATAR_TIERS.find(t => t.tier === tier) ?? AVATAR_TIERS[0]
  const orbSize = 120

  return (
    <div className="flex flex-col items-center gap-4">
      {/* The Orb */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative flex items-center justify-center"
        style={{
          width: orbSize,
          height: orbSize,
          borderRadius: '50%',
          background: `conic-gradient(${tierInfo.colorStart}, ${tierInfo.colorEnd}, ${tierInfo.colorStart})`,
          padding: 3,
          boxShadow: `0 0 ${20 + tier * 8}px rgba(255,255,255,${0.05 + tier * 0.04})`,
        }}
      >
        <span
          className="flex items-center justify-center w-full h-full rounded-full"
          style={{
            background: '#000',
            fontSize: 36,
            fontWeight: 300,
            color: 'rgba(255,255,255,0.9)',
            letterSpacing: '-0.02em',
            fontFamily: 'var(--font-body)',
          }}
        >
          {level}
        </span>

        {/* Ambient pulse ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            border: `1px solid ${tierInfo.colorStart}`,
            opacity: 0.15,
            animation: 'avatar-pulse 3s ease-in-out infinite',
          }}
        />
      </motion.div>

      {/* Tier name */}
      <div className="text-center">
        <p
          className="text-sm tracking-widest uppercase font-light"
          style={{ color: tierInfo.colorStart }}
        >
          {tierName}
        </p>
      </div>
    </div>
  )
}

function TierProgressBar({
  totalXP,
  tierProgress,
  nextTierName,
  nextTierXP,
}: {
  totalXP: number
  tierProgress: number
  nextTierName: string | null
  nextTierXP: number | null
}) {
  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.5)' }}>
          {totalXP} XP
        </span>
        {nextTierName && nextTierXP && (
          <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
            {nextTierXP - totalXP} XP to {nextTierName}
          </span>
        )}
        {!nextTierName && (
          <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
            Max tier reached
          </span>
        )}
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${tierProgress}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: 'rgba(255,255,255,0.7)' }}
        />
      </div>
    </div>
  )
}

function TierRoadmap({ currentTier }: { currentTier: AvatarTier }) {
  return (
    <div className="w-full">
      <p className="text-xs font-light mb-4 tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
        EVOLUTION PATH
      </p>
      <div className="flex items-center justify-between gap-1">
        {AVATAR_TIERS.map((t) => {
          const isActive = t.tier <= currentTier
          const isCurrent = t.tier === currentTier
          return (
            <div key={t.tier} className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className="w-full rounded-full transition-all"
                style={{
                  height: isCurrent ? 4 : 2,
                  background: isActive ? t.colorStart : 'rgba(255,255,255,0.06)',
                  boxShadow: isCurrent ? `0 0 8px ${t.colorStart}` : 'none',
                }}
              />
              <span
                className="text-[9px] font-light tracking-wide"
                style={{
                  color: isActive ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.15)',
                }}
              >
                {t.name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AchievementGrid({ achievements }: { achievements: Achievement[] }) {
  if (achievements.length === 0) return null

  return (
    <div className="w-full">
      <p className="text-xs font-light mb-4 tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
        ACHIEVEMENTS
      </p>
      <div className="grid grid-cols-2 gap-2.5">
        {achievements.map((a) => {
          const unlocked = !!a.unlockedAt
          return (
            <div
              key={a.id}
              className="rounded-xl px-4 py-3 transition-all"
              style={{
                background: unlocked ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                border: unlocked
                  ? '1px solid rgba(255,255,255,0.12)'
                  : '1px solid rgba(255,255,255,0.04)',
                opacity: unlocked ? 1 : 0.4,
              }}
            >
              <p
                className="text-xs font-light leading-snug"
                style={{ color: unlocked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)' }}
              >
                {a.title}
              </p>
              <p
                className="text-[10px] font-light mt-1 leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.2)' }}
              >
                {a.description}
              </p>
              <p
                className="text-[9px] font-light mt-1.5"
                style={{ color: unlocked ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)' }}
              >
                +{a.xpBonus} XP
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function XPBreakdown({ xpToday, xpTodayTotal }: { xpToday: { source: string; amount: number }[]; xpTodayTotal: number }) {
  if (xpToday.length === 0) return null

  const SOURCE_LABELS: Record<string, string> = {
    checkin: 'Habit check-in',
    milestone: 'Streak milestone',
    chat: 'Conversation',
    memory: 'Memory saved',
    agent: 'Agent tool',
    login: 'Daily login',
    achievement: 'Achievement bonus',
  }

  // Group by source
  const grouped = xpToday.reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] || 0) + e.amount
    return acc
  }, {})

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-3">
        <p className="text-xs font-light tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
          TODAY'S XP
        </p>
        <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.5)' }}>
          +{xpTodayTotal}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {Object.entries(grouped).map(([source, amount]) => (
          <div key={source} className="flex justify-between items-center">
            <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {SOURCE_LABELS[source] || source}
            </span>
            <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
              +{amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function HabitCard({
  streak,
  onCheckIn,
  isCheckedInToday,
}: {
  streak: HabitStreak
  onCheckIn: (nodeId: string, title: string) => void
  isCheckedInToday: boolean
}) {
  const today = new Date().toISOString().slice(0, 10)
  const done = isCheckedInToday || streak.lastCheckedIn === today

  return (
    <div
      className="rounded-2xl px-5 py-4"
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.07)',
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
              <span className="text-xs font-light" style={{ color: 'rgba(255,255,255,0.2)' }}>
                Best: {streak.longestStreak}
              </span>
            )}
          </div>
        </div>
        {done ? (
          <span className="shrink-0 text-xs font-light" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Done
          </span>
        ) : (
          <button
            onClick={() => onCheckIn(streak.nodeId, streak.title)}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-light transition-opacity hover:opacity-80"
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.85)',
              cursor: 'pointer',
            }}
          >
            {streak.currentStreak === 0 ? 'Start' : 'Check in'}
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StreakAvatarPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const avatar = useAvatar()
  const { data: streakData, checkIn, lastResult } = useStreak()
  const [checkedInToday, setCheckedInToday] = useState<Set<string>>(new Set())
  const [showMilestone, setShowMilestone] = useState(false)
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
      // Auto-dismiss
      const timer = setTimeout(() => setShowMilestone(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [lastResult])

  // Refetch avatar data after check-in
  useEffect(() => {
    if (lastResult && !lastResult.alreadyCheckedIn) {
      avatar.refetch()
    }
  }, [lastResult])

  const handleCheckIn = useCallback(
    async (nodeId: string, title: string) => {
      const result = await checkIn(nodeId, title)
      if (result && !result.alreadyCheckedIn) {
        setCheckedInToday(prev => new Set(prev).add(nodeId))
      }
    },
    [checkIn],
  )

  if (!isLoaded || !user) return null

  const habits = avatar.habits

  // Build full achievements list (locked + unlocked)
  const allAchievements: Achievement[] = (() => {
    // We can't call server-side getAllAchievements from client,
    // so we replicate the logic by showing what we have + placeholders
    const ACHIEVEMENT_DEFS = [
      { id: 'first_words', title: 'First Words', description: 'Send your first message to Missi', xpBonus: 5 },
      { id: 'memory_keeper', title: 'Memory Keeper', description: 'Have 10 memories saved', xpBonus: 10 },
      { id: 'habit_builder', title: 'Habit Builder', description: 'Reach a 7-day streak on any habit', xpBonus: 25 },
      { id: 'centurion', title: 'Centurion', description: 'Reach a 100-day streak', xpBonus: 100 },
      { id: 'dedicated', title: 'Dedicated', description: 'Log in 7 days in a row', xpBonus: 15 },
      { id: 'power_user', title: 'Power User', description: 'Reach Level 10', xpBonus: 50 },
      { id: 'agent_master', title: 'Agent Master', description: 'Use agent tools 10 times', xpBonus: 25 },
      { id: 'ember_unlocked', title: 'Rising Ember', description: 'Reach the Ember tier', xpBonus: 5 },
      { id: 'flame_unlocked', title: 'Burning Flame', description: 'Reach the Flame tier', xpBonus: 15 },
      { id: 'nova_unlocked', title: 'Supernova', description: 'Reach the Nova tier', xpBonus: 50 },
    ]

    return ACHIEVEMENT_DEFS.map(def => {
      const existing = avatar.achievements.find(a => a.id === def.id)
      return existing ?? { ...def, unlockedAt: null }
    })
  })()

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-10"
      style={{
        background: '#000000',
        fontFamily: 'var(--font-body)',
      }}
    >
      <div className="w-full max-w-md">
        {/* Back link */}
        <Link
          href="/chat"
          className="flex items-center gap-2 mb-10 opacity-40 hover:opacity-70 transition-opacity"
          style={{ color: 'white', textDecoration: 'none' }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-light tracking-wide">Back</span>
        </Link>

        {/* ── Avatar Section ───────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-6 mb-10">
          <AvatarOrb tier={avatar.tier} tierName={avatar.tierName} level={avatar.level} />

          <TierProgressBar
            totalXP={avatar.totalXP}
            tierProgress={avatar.tierProgress}
            nextTierName={avatar.nextTierName}
            nextTierXP={avatar.nextTierXP}
          />
        </div>

        {/* ── Tier Roadmap ─────────────────────────────────────────────── */}
        <div className="mb-10">
          <TierRoadmap currentTier={avatar.tier} />
        </div>

        {/* ── Today's XP ───────────────────────────────────────────────── */}
        {avatar.xpTodayTotal > 0 && (
          <div
            className="mb-8 rounded-2xl px-5 py-4"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <XPBreakdown xpToday={avatar.xpToday} xpTodayTotal={avatar.xpTodayTotal} />
          </div>
        )}

        {/* ── Streaks Section ──────────────────────────────────────────── */}
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-light tracking-wide" style={{ color: 'rgba(255,255,255,0.3)' }}>
              HABITS
            </p>
            {avatar.loginStreak > 0 && (
              <span className="text-[10px] font-light" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {avatar.loginStreak}-day login streak
              </span>
            )}
          </div>

          {avatar.isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 rounded-full border border-white/10 animate-pulse" />
            </div>
          )}

          {!avatar.isLoading && habits.length === 0 && (
            <p className="text-center text-sm font-light leading-relaxed py-8" style={{ color: 'rgba(255,255,255,0.25)' }}>
              No habits tracked yet. Tell Missi about a habit you want to build.
            </p>
          )}

          {!avatar.isLoading && habits.length > 0 && (
            <div className="flex flex-col gap-2.5">
              {habits.map(streak => (
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

        {/* ── Achievements ─────────────────────────────────────────────── */}
        <div className="mb-16">
          <AchievementGrid achievements={allAchievements} />
        </div>
      </div>

      {/* ── Milestone Toast ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showMilestone && celebrationRef.current && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="fixed bottom-8 left-4 right-4 z-50 flex justify-center"
          >
            <div
              className="max-w-sm w-full rounded-2xl px-6 py-4 text-center"
              style={{
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(255,255,255,0.12)',
              }}
            >
              <p className="text-sm font-light text-white/80 leading-relaxed">
                {celebrationRef.current}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes avatar-pulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.08); opacity: 0.25; }
        }
      `}</style>
    </div>
  )
}
