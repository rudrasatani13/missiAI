'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Flame, Trophy, Zap, TrendingUp, Sparkles, Check } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAvatar } from '@/hooks/gamification/useAvatar'
import { useStreak } from '@/hooks/gamification/useStreak'
import { AVATAR_TIERS, type AvatarTier } from '@/types/gamification'
import { ChatShell } from '@/components/shell/ChatShell'
import type { HabitStreak, Achievement } from '@/types/gamification'

// ─── Glass Card wrapper ──────────────────────────────────────────────────────

function GlassCard({
  children,
  className = '',
  delay = 0,
  glow: _glow,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  glow?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl ${className}`}
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
        boxShadow: 'none',
      }}
    >
      {children}
    </motion.div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvatarOrb({ tier, tierName, level }: { tier: AvatarTier; tierName: string; level: number }) {
  const tierInfo = AVATAR_TIERS.find(t => t.tier === tier) ?? AVATAR_TIERS[0]
  const orbSize = 130

  return (
    <div className="flex flex-col items-center gap-5">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative flex items-center justify-center"
      >
        {/* Main orb */}
        <div
          className="relative flex items-center justify-center"
          style={{
            width: orbSize,
            height: orbSize,
            borderRadius: '50%',
            background: `conic-gradient(${tierInfo.colorStart}, ${tierInfo.colorEnd}, ${tierInfo.colorStart})`,
            padding: 3,
          }}
        >
          <span
            className="flex items-center justify-center w-full h-full rounded-full"
            style={{
              background: 'var(--missi-bg)',
              fontSize: 40,
              fontWeight: 200,
              color: 'var(--missi-text-primary)',
              letterSpacing: '-0.02em',
              fontFamily: 'var(--font-body)',
            }}
          >
            {level}
          </span>

          {/* Pulse ring */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              border: `1px solid ${tierInfo.colorStart}`,
              opacity: 0.2,
              animation: 'avatar-pulse 3s ease-in-out infinite',
            }}
          />
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-center"
      >
        <p
          className="text-xs tracking-[0.25em] uppercase font-medium"
          style={{ color: tierInfo.colorStart }}
        >
          {tierName}
        </p>
      </motion.div>
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
    <div className="w-full px-1">
      <div className="flex justify-between items-center mb-2.5">
        <span className="text-[11px] font-medium tracking-wide" style={{ color: 'var(--missi-text-secondary)' }}>
          <Zap className="w-3 h-3 inline-block mr-1 -mt-0.5" />
          {totalXP} XP
        </span>
        {nextTierName && nextTierXP && (
          <span className="text-[11px] font-light" style={{ color: 'var(--missi-text-muted)' }}>
            {nextTierXP - totalXP} to {nextTierName}
          </span>
        )}
        {!nextTierName && (
          <span className="text-[11px] font-light" style={{ color: 'var(--missi-text-muted)' }}>
            Max tier
          </span>
        )}
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 2, background: 'var(--missi-border)' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${tierProgress}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full"
          style={{ background: 'var(--missi-nav-text-active)' }}
        />
      </div>
    </div>
  )
}

function TierRoadmap({ currentTier }: { currentTier: AvatarTier }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--missi-text-muted)' }} />
        <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--missi-text-muted)' }}>
          Evolution Path
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {AVATAR_TIERS.map((t) => {
          const isActive = t.tier <= currentTier
          const isCurrent = t.tier === currentTier
          return (
            <div key={t.tier} className="flex flex-col items-center gap-2 flex-1">
              <div className="relative w-full">
                <div
                  className="w-full rounded-full transition-all"
                  style={{
                    height: isCurrent ? 5 : 3,
                    background: isActive
                      ? `linear-gradient(90deg, ${t.colorStart}, ${t.colorEnd})`
                      : 'var(--missi-border)',
                  }}
                />
                {isCurrent && (
                  <div
                    className="absolute -top-0.5 right-0 w-1.5 h-1.5 rounded-full"
                    style={{
                      background: t.colorEnd,
                      boxShadow: `0 0 6px ${t.colorEnd}`,
                      animation: 'avatar-pulse 2s ease-in-out infinite',
                    }}
                  />
                )}
              </div>
              <span
                className="text-[8px] font-medium tracking-wider"
                style={{
                  color: isCurrent ? 'var(--missi-text-secondary)' : isActive ? 'var(--missi-text-secondary)' : 'var(--missi-text-muted)',
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
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="w-3.5 h-3.5" style={{ color: 'var(--missi-text-muted)' }} />
        <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--missi-text-muted)' }}>
          Achievements
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {achievements.map((a, i) => {
          const unlocked = !!a.unlockedAt
          return (
            <motion.div
              key={a.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
              className="rounded-xl px-4 py-3.5"
              style={{
                background: unlocked ? 'var(--missi-border)' : 'var(--missi-surface)',
                border: unlocked
                  ? '1px solid var(--missi-border)'
                  : '1px solid var(--missi-border)',
                opacity: unlocked ? 1 : 0.4,
              }}
            >
              <div className="flex items-start gap-2">
                {unlocked && (
                  <div className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'var(--missi-nav-active-bg)', border: '1px solid var(--missi-border-strong)' }}>
                    <Check className="w-2.5 h-2.5" style={{ color: 'var(--missi-text-secondary)' }} strokeWidth={2.5} />
                  </div>
                )}
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-medium leading-snug"
                    style={{ color: unlocked ? 'var(--missi-text-primary)' : 'var(--missi-text-muted)' }}
                  >
                    {a.title}
                  </p>
                  <p
                    className="text-[9px] font-light mt-1 leading-relaxed"
                    style={{ color: 'var(--missi-text-muted)' }}
                  >
                    {a.description}
                  </p>
                </div>
              </div>
              <div
                className="mt-2 inline-block px-2 py-0.5 rounded-full text-[9px] font-semibold tracking-wide"
                style={{
                  background: 'var(--missi-surface)',
                  color: unlocked ? 'var(--missi-text-secondary)' : 'var(--missi-text-muted)',
                  border: '1px solid var(--missi-border)',
                }}
              >
                +{a.xpBonus} XP
              </div>
            </motion.div>
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

  const grouped = xpToday.reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] || 0) + e.amount
    return acc
  }, {})

  return (
    <div className="w-full">
      <div className="flex justify-between items-center mb-3.5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--missi-text-muted)' }} />
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--missi-text-muted)' }}>
            Today&apos;s XP
          </p>
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            color: 'var(--missi-text-primary)',
            background: 'var(--missi-border)',
            border: '1px solid var(--missi-border)',
          }}
        >
          +{xpTodayTotal}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {Object.entries(grouped).map(([source, amount]) => (
          <div
            key={source}
            className="flex justify-between items-center px-3 py-2 rounded-lg"
            style={{ background: 'var(--missi-surface)' }}
          >
            <span className="text-[11px] font-light" style={{ color: 'var(--missi-text-secondary)' }}>
              {SOURCE_LABELS[source] || source}
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'var(--missi-text-secondary)' }}>
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
  index,
}: {
  streak: HabitStreak
  onCheckIn: (nodeId: string, title: string) => void
  isCheckedInToday: boolean
  index: number
}) {
  const today = new Date().toISOString().slice(0, 10)
  const done = isCheckedInToday || streak.lastCheckedIn === today

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: 0.05 * index }}
      className="rounded-2xl px-5 py-4"
      style={{
        background: 'var(--missi-surface)',
        border: done
          ? '1px solid var(--missi-border)'
          : '1px solid var(--missi-border)',
        borderLeft: done ? '2px solid var(--missi-border-strong)' : '2px solid transparent',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-light leading-snug truncate">
            {streak.title}
          </p>
          <div className="flex items-center gap-3 mt-2.5">
            <span
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: streak.currentStreak > 0 ? 'var(--missi-text-primary)' : 'var(--missi-text-muted)' }}
            >
              <Flame className="w-3.5 h-3.5" style={{ color: streak.currentStreak > 0 ? '#F97316' : undefined }} />
              {streak.currentStreak > 0 ? `${streak.currentStreak} days` : 'No streak'}
            </span>
            {streak.longestStreak > 0 && (
              <span
                className="text-[10px] font-light px-2 py-0.5 rounded-full"
                style={{
                  color: 'var(--missi-text-muted)',
                  background: 'var(--missi-surface)',
                }}
              >
                Best: {streak.longestStreak}
              </span>
            )}
          </div>
        </div>
        {done ? (
          <div
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: 'var(--missi-nav-active-bg)', border: '1px solid var(--missi-border-strong)' }}
          >
            <Check className="w-3 h-3" style={{ color: 'var(--missi-text-secondary)' }} strokeWidth={2.5} />
          </div>
        ) : (
          <button
            onClick={() => onCheckIn(streak.nodeId, streak.title)}
            className="shrink-0 px-4 py-1.5 rounded-full text-[11px] font-medium transition-colors active:scale-[0.97]"
            style={{
              background: 'var(--missi-nav-text-active)',
              border: '1px solid var(--missi-border-strong)',
              color: 'var(--missi-bg)',
              cursor: 'pointer',
            }}
          >
            {streak.currentStreak === 0 ? 'Start' : 'Check in'}
          </button>
        )}
      </div>
    </motion.div>
  )
}

// ─── Active Quests Card ───────────────────────────────────────────────────────

function ActiveQuestsCard() {
  const [quests, setQuests] = useState<Array<{
    id: string; title: string; coverEmoji: string; completedMissions: number;
    totalMissions: number; category: string; status: string;
  }>>([])

  useEffect(() => {
    fetch('/api/v1/quests?status=active')
      .then(r => r.json())
      .then(d => {
        if (d?.success && d.quests?.length > 0) {
          setQuests(d.quests.slice(0, 3))
        }
      })
      .catch(() => {})
  }, [])

  if (quests.length === 0) return null

  const CATEGORY_COLORS: Record<string, string> = {
    health: '#34D399', learning: '#60A5FA', creativity: '#F472B6',
    relationships: '#FBBF24', career: '#A78BFA', mindfulness: '#2DD4BF', other: '#94A3B8',
  }

  return (
    <GlassCard className="px-5 py-5" delay={0.3}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5" style={{ color: 'var(--missi-text-muted)' }} />
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--missi-text-muted)' }}>
            Active Quests
          </p>
        </div>
        <Link
          href="/quests"
          className="text-[10px] font-medium px-2.5 py-0.5 rounded-full transition-all hover:bg-[var(--missi-surface)]"
          style={{ color: 'var(--missi-nav-accent)', textDecoration: 'none' }}
        >
          View all →
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {quests.map(q => {
          const pct = q.totalMissions > 0 ? Math.round((q.completedMissions / q.totalMissions) * 100) : 0
          const color = CATEGORY_COLORS[q.category] ?? '#94A3B8'
          return (
            <Link key={q.id} href="/quests" style={{ textDecoration: 'none' }}>
              <div className="flex items-center gap-3 group cursor-pointer">
                <span className="text-lg transition-transform group-hover:scale-110">{q.coverEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--missi-text-secondary)' }}>
                    {q.title}
                  </p>
                  <div className="w-full h-1 rounded-full mt-1.5" style={{ background: 'var(--missi-border)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${pct}%`,
                        background: `linear-gradient(90deg, ${color}60, ${color})`,
                      }}
                    />
                  </div>
                </div>
                <span className="text-[10px] font-medium" style={{ color }}>{pct}%</span>
              </div>
            </Link>
          )
        })}
      </div>
    </GlassCard>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StreakAvatarPage() {
  const { user, isLoaded } = useUser()
  const router = useRouter()
  const avatar = useAvatar()
  const avatarRefetch = avatar.refetch
  const { checkIn, lastResult } = useStreak()
  const [checkedInToday, setCheckedInToday] = useState<Set<string>>(new Set())
  const [showMilestone, setShowMilestone] = useState(false)
  const celebrationRef = useRef<string | null>(null)

  useEffect(() => {
    if (isLoaded && !user) {
      router.replace('/sign-in')
    }
  }, [isLoaded, user, router])

  useEffect(() => {
    if (lastResult?.milestone && lastResult.celebrationText) {
      celebrationRef.current = lastResult.celebrationText
      setShowMilestone(true)
      const timer = setTimeout(() => setShowMilestone(false), 4000)
      return () => clearTimeout(timer)
    }
  }, [lastResult])

  useEffect(() => {
    if (lastResult && !lastResult.alreadyCheckedIn) {
      avatarRefetch()
    }
  }, [lastResult, avatarRefetch])

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

  const allAchievements: Achievement[] = (() => {
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
    <ChatShell>
      <div
        className="relative min-h-full flex flex-col items-center justify-start px-4 py-6 md:py-8 lg:px-10"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {/* Ambient field — warm amber (streak palette). Absolute so it stays
            inside the rounded main card. */}
        <div aria-hidden className="absolute inset-0 pointer-events-none z-0" style={{
          background: 'radial-gradient(500px circle at 20% 10%, rgba(251,191,36,0.06), transparent 60%), radial-gradient(400px circle at 80% 85%, rgba(245,158,11,0.04), transparent 65%)',
          filter: 'blur(100px)',
        }} />

        <div className="w-full max-w-md lg:max-w-6xl relative z-10">
          {/* Sidebar provides navigation — no Back link needed. */}

          {/* ── Desktop: 2-column grid / Mobile: stacked ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Left Column ─────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Avatar Section */}
            <GlassCard className="px-6 py-8" delay={0.1}>
              <div className="flex flex-col items-center gap-6">
                <AvatarOrb tier={avatar.tier} tierName={avatar.tierName} level={avatar.level} />
                <TierProgressBar
                  totalXP={avatar.totalXP}
                  tierProgress={avatar.tierProgress}
                  nextTierName={avatar.nextTierName}
                  nextTierXP={avatar.nextTierXP}
                />
              </div>
            </GlassCard>

            {/* Tier Roadmap */}
            <GlassCard className="px-5 py-5" delay={0.2}>
              <TierRoadmap currentTier={avatar.tier} />
            </GlassCard>

            {/* Today's XP */}
            {avatar.xpTodayTotal > 0 && (
              <GlassCard className="px-5 py-5" delay={0.25}>
                <XPBreakdown xpToday={avatar.xpToday} xpTodayTotal={avatar.xpTodayTotal} />
              </GlassCard>
            )}
          </div>

          {/* ── Right Column ────────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            {/* Streaks / Habits Section */}
            <GlassCard className="px-5 py-5" delay={0.3}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Flame className="w-3.5 h-3.5" style={{ color: 'var(--missi-text-muted)' }} />
                  <p className="text-[10px] font-semibold tracking-[0.18em] uppercase" style={{ color: 'var(--missi-text-muted)' }}>
                    Habits
                  </p>
                </div>
                {avatar.loginStreak > 0 && (
                  <span
                    className="text-[10px] font-medium px-2.5 py-0.5 rounded-full"
                    style={{
                      color: 'var(--missi-text-secondary)',
                      background: 'var(--missi-border)',
                      border: '1px solid var(--missi-border)',
                    }}
                  >
                    {avatar.loginStreak}-day login streak
                  </span>
                )}
              </div>

              {avatar.isLoading && (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 rounded-full border-2 border-[var(--missi-border)] border-t-white/40 animate-spin" />
                </div>
              )}

              {!avatar.isLoading && habits.length === 0 && (
                <div className="text-center py-10 px-4">
                  <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}>
                    <Flame className="w-5 h-5" style={{ color: 'var(--missi-text-muted)' }} />
                  </div>
                  <p className="text-sm font-light leading-relaxed" style={{ color: 'var(--missi-text-muted)' }}>
                    No habits tracked yet.
                  </p>
                  <p className="text-xs font-light mt-1" style={{ color: 'var(--missi-text-muted)' }}>
                    Tell Missi about a habit you want to build.
                  </p>
                </div>
              )}

              {!avatar.isLoading && habits.length > 0 && (
                <div className="flex flex-col gap-2.5">
                  {habits.map((streak, i) => (
                    <HabitCard
                      key={streak.nodeId}
                      streak={streak}
                      onCheckIn={handleCheckIn}
                      isCheckedInToday={checkedInToday.has(streak.nodeId)}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Active Quests */}
            <ActiveQuestsCard />

            {/* Achievements */}
            <GlassCard className="px-5 py-5" delay={0.35}>
              <AchievementGrid achievements={allAchievements} />
            </GlassCard>
          </div>

        </div>

        {/* Bottom spacer */}
        <div className="mb-16" />
      </div>

      {/* ── Milestone Toast ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showMilestone && celebrationRef.current && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-8 left-4 right-4 z-50 flex justify-center"
          >
            <div
              className="max-w-sm w-full rounded-2xl px-6 py-5 text-center"
              style={{
                background: 'var(--missi-surface)',
                backdropFilter: 'blur(24px) saturate(140%)',
                WebkitBackdropFilter: 'blur(24px) saturate(140%)',
                border: '1px solid var(--missi-border)',
                boxShadow: '0 20px 50px -20px rgba(0,0,0,0.7), inset 0 1px 0 var(--missi-border)',
              }}
            >
              <Sparkles className="w-4 h-4 mx-auto mb-2" style={{ color: 'var(--missi-text-secondary)' }} />
              <p className="text-sm font-light leading-relaxed" style={{ color: 'var(--missi-text-primary)' }}>
                {celebrationRef.current}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx>{`
        @keyframes avatar-pulse {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.1); opacity: 0.35; }
        }
      `}</style>
      </div>
    </ChatShell>
  )
}
