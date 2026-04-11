'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Flame, ArrowLeft, Trophy, Zap, TrendingUp, Sparkles, Check } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAvatar } from '@/hooks/useAvatar'
import { useStreak } from '@/hooks/useStreak'
import { AVATAR_TIERS, type AvatarTier } from '@/types/gamification'
import type { HabitStreak, Achievement } from '@/types/gamification'

// ─── Glass Card wrapper ──────────────────────────────────────────────────────

function GlassCard({
  children,
  className = '',
  delay = 0,
  glow,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  glow?: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: glow
          ? 'linear-gradient(135deg, rgba(15,15,20,0.95), rgba(8,8,12,0.98))'
          : 'rgba(12,12,16,0.95)',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
        isolation: 'isolate',
      }}
    >
      {glow && (
        <div
          className="absolute -top-20 -right-20 w-44 h-44 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
            opacity: 0.1,
            filter: 'blur(20px)',
          }}
        />
      )}
      <div className="relative z-10">{children}</div>
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
        {/* Outer glow ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(${tierInfo.colorStart}40, ${tierInfo.colorEnd}40, ${tierInfo.colorStart}40)`,
            filter: `blur(20px)`,
            transform: 'scale(1.3)',
          }}
        />

        {/* Main orb */}
        <div
          className="relative flex items-center justify-center"
          style={{
            width: orbSize,
            height: orbSize,
            borderRadius: '50%',
            background: `conic-gradient(${tierInfo.colorStart}, ${tierInfo.colorEnd}, ${tierInfo.colorStart})`,
            padding: 3,
            boxShadow: `0 0 40px ${tierInfo.colorStart}30, 0 0 80px ${tierInfo.colorStart}15`,
          }}
        >
          <span
            className="flex items-center justify-center w-full h-full rounded-full"
            style={{
              background: 'radial-gradient(circle at 30% 30%, rgba(30,30,30,1), rgba(5,5,5,1))',
              fontSize: 40,
              fontWeight: 200,
              color: 'rgba(255,255,255,0.95)',
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
        <span className="text-[11px] font-medium tracking-wide" style={{ color: 'rgba(255,255,255,0.6)' }}>
          <Zap className="w-3 h-3 inline-block mr-1 -mt-0.5" />
          {totalXP} XP
        </span>
        {nextTierName && nextTierXP && (
          <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {nextTierXP - totalXP} to {nextTierName}
          </span>
        )}
        {!nextTierName && (
          <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Max tier
          </span>
        )}
      </div>
      <div
        className="w-full rounded-full overflow-hidden"
        style={{ height: 6, background: 'rgba(255,255,255,0.06)' }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${tierProgress}%` }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full"
          style={{
            background: 'linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.9))',
            boxShadow: '0 0 12px rgba(255,255,255,0.3)',
          }}
        />
      </div>
    </div>
  )
}

function TierRoadmap({ currentTier }: { currentTier: AvatarTier }) {
  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
        <p className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
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
                      : 'rgba(255,255,255,0.06)',
                    boxShadow: isCurrent ? `0 0 12px ${t.colorStart}60` : 'none',
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
                  color: isCurrent ? 'rgba(255,255,255,0.8)' : isActive ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.15)',
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
        <Trophy className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
        <p className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
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
              className="relative rounded-xl px-4 py-3.5 overflow-hidden transition-all"
              style={{
                background: unlocked
                  ? 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))'
                  : 'rgba(255,255,255,0.02)',
                border: unlocked
                  ? '1px solid rgba(255,255,255,0.15)'
                  : '1px solid rgba(255,255,255,0.04)',
                opacity: unlocked ? 1 : 0.45,
              }}
            >
              {unlocked && (
                <div
                  className="absolute top-0 right-0 w-16 h-16 pointer-events-none"
                  style={{
                    background: 'radial-gradient(circle at top right, rgba(250,204,21,0.12) 0%, transparent 70%)',
                  }}
                />
              )}
              <div className="flex items-start gap-2">
                {unlocked && (
                  <div className="shrink-0 mt-0.5 w-4 h-4 rounded-full flex items-center justify-center" style={{ background: 'rgba(250,204,21,0.15)' }}>
                    <Check className="w-2.5 h-2.5" style={{ color: '#FACC15' }} />
                  </div>
                )}
                <div className="min-w-0">
                  <p
                    className="text-[11px] font-medium leading-snug"
                    style={{ color: unlocked ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)' }}
                  >
                    {a.title}
                  </p>
                  <p
                    className="text-[9px] font-light mt-1 leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.25)' }}
                  >
                    {a.description}
                  </p>
                </div>
              </div>
              <div
                className="mt-2 inline-block px-2 py-0.5 rounded-full text-[8px] font-semibold tracking-wide"
                style={{
                  background: unlocked ? 'rgba(250,204,21,0.1)' : 'rgba(255,255,255,0.03)',
                  color: unlocked ? '#FACC15' : 'rgba(255,255,255,0.15)',
                  border: unlocked ? '1px solid rgba(250,204,21,0.15)' : '1px solid rgba(255,255,255,0.05)',
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
          <Sparkles className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
          <p className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Today&apos;s XP
          </p>
        </div>
        <span
          className="text-xs font-semibold px-2.5 py-0.5 rounded-full"
          style={{
            color: '#4ade80',
            background: 'rgba(74,222,128,0.1)',
            border: '1px solid rgba(74,222,128,0.15)',
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
            style={{ background: 'rgba(255,255,255,0.03)' }}
          >
            <span className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {SOURCE_LABELS[source] || source}
            </span>
            <span className="text-[11px] font-medium" style={{ color: 'rgba(74,222,128,0.7)' }}>
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
      className="relative rounded-2xl px-5 py-4 overflow-hidden"
      style={{
        background: done
          ? 'linear-gradient(135deg, rgba(74,222,128,0.06), rgba(255,255,255,0.03))'
          : 'rgba(255,255,255,0.04)',
        border: done
          ? '1px solid rgba(74,222,128,0.15)'
          : '1px solid rgba(255,255,255,0.07)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {done && (
        <div
          className="absolute top-0 right-0 w-20 h-20 pointer-events-none"
          style={{ background: 'radial-gradient(circle at top right, rgba(74,222,128,0.08) 0%, transparent 70%)' }}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-light leading-snug truncate">
            {streak.title}
          </p>
          <div className="flex items-center gap-3 mt-2.5">
            <span
              className="flex items-center gap-1.5 text-xs font-medium"
              style={{ color: streak.currentStreak > 0 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)' }}
            >
              <Flame className="w-3.5 h-3.5" style={{ color: streak.currentStreak > 0 ? '#F97316' : undefined }} />
              {streak.currentStreak > 0 ? `${streak.currentStreak} days` : 'No streak'}
            </span>
            {streak.longestStreak > 0 && (
              <span
                className="text-[10px] font-light px-2 py-0.5 rounded-full"
                style={{
                  color: 'rgba(255,255,255,0.35)',
                  background: 'rgba(255,255,255,0.04)',
                }}
              >
                Best: {streak.longestStreak}
              </span>
            )}
          </div>
        </div>
        {done ? (
          <div className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full" style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.2)' }}>
            <Check className="w-3 h-3" style={{ color: '#4ade80' }} />
            <span className="text-[11px] font-medium" style={{ color: '#4ade80' }}>Done</span>
          </div>
        ) : (
          <button
            onClick={() => onCheckIn(streak.nodeId, streak.title)}
            className="shrink-0 px-4 py-2 rounded-full text-[11px] font-medium transition-all hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.06))',
              border: '1px solid rgba(255,255,255,0.18)',
              color: 'rgba(255,255,255,0.9)',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            {streak.currentStreak === 0 ? 'Start' : 'Check in'}
          </button>
        )}
      </div>
    </motion.div>
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
    <div
      className="min-h-screen flex flex-col items-center justify-start px-4 py-8 md:py-12"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(20,20,30,1) 0%, #000000 60%)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[20%] w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.06) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)' }} />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Back link */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.3 }}>
          <Link
            href="/chat"
            className="inline-flex items-center gap-2 mb-10 px-3 py-1.5 rounded-full opacity-50 hover:opacity-90 transition-all hover:bg-white/5"
            style={{ color: 'white', textDecoration: 'none' }}
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-light tracking-wide">Back</span>
          </Link>
        </motion.div>

        {/* ── Avatar Section ───────────────────────────────────────────── */}
        <GlassCard className="px-6 py-8 mb-4" delay={0.1} glow="rgba(124,58,237,0.3)">
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

        {/* ── Tier Roadmap ─────────────────────────────────────────────── */}
        <GlassCard className="px-5 py-5 mb-4" delay={0.2}>
          <TierRoadmap currentTier={avatar.tier} />
        </GlassCard>

        {/* ── Today's XP ───────────────────────────────────────────────── */}
        {avatar.xpTodayTotal > 0 && (
          <GlassCard className="px-5 py-5 mb-4" delay={0.25} glow="rgba(74,222,128,0.2)">
            <XPBreakdown xpToday={avatar.xpToday} xpTodayTotal={avatar.xpTodayTotal} />
          </GlassCard>
        )}

        {/* ── Streaks / Habits Section ─────────────────────────────────── */}
        <GlassCard className="px-5 py-5 mb-4" delay={0.3}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Flame className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.3)' }} />
              <p className="text-[10px] font-semibold tracking-[0.15em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Habits
              </p>
            </div>
            {avatar.loginStreak > 0 && (
              <span
                className="text-[10px] font-medium px-2.5 py-0.5 rounded-full"
                style={{
                  color: 'rgba(255,255,255,0.5)',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {avatar.loginStreak}-day login streak
              </span>
            )}
          </div>

          {avatar.isLoading && (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/40 animate-spin" />
            </div>
          )}

          {!avatar.isLoading && habits.length === 0 && (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Flame className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.15)' }} />
              </div>
              <p className="text-sm font-light leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
                No habits tracked yet.
              </p>
              <p className="text-xs font-light mt-1" style={{ color: 'rgba(255,255,255,0.15)' }}>
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

        {/* ── Achievements ─────────────────────────────────────────────── */}
        <GlassCard className="px-5 py-5 mb-16" delay={0.35}>
          <AchievementGrid achievements={allAchievements} />
        </GlassCard>
      </div>

      {/* ── Milestone Toast ──────────────────────────────────────────── */}
      <AnimatePresence>
        {showMilestone && celebrationRef.current && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-8 left-4 right-4 z-50 flex justify-center"
          >
            <div
              className="max-w-sm w-full rounded-2xl px-6 py-5 text-center"
              style={{
                background: 'rgba(10,10,10,0.85)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.12)',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              }}
            >
              <Sparkles className="w-5 h-5 mx-auto mb-2" style={{ color: '#FACC15' }} />
              <p className="text-sm font-light text-white/85 leading-relaxed">
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
  )
}
