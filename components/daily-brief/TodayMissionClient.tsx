'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, RefreshCw, Target, Flame, Heart, Zap, Calendar, MessageCircle, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DailyBrief, DailyTask } from '@/types/daily-brief'

// ─── Source Badge Config ──────────────────────────────────────────────────────

const SOURCE_BADGES: Record<DailyTask['source'], { icon: string; label: string; color: string }> = {
  goal: { icon: '🎯', label: 'Goal', color: 'rgba(168, 130, 255, 0.7)' },
  habit: { icon: '🔥', label: 'Habit', color: 'rgba(251, 146, 60, 0.7)' },
  calendar: { icon: '📅', label: 'Calendar', color: 'rgba(96, 165, 250, 0.7)' },
  challenge: { icon: '⚡', label: 'Challenge', color: 'rgba(250, 204, 21, 0.7)' },
  missi: { icon: '✨', label: 'Missi', color: 'rgba(167, 243, 208, 0.7)' },
}

// ─── Date Formatter ───────────────────────────────────────────────────────────

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

// ─── Time-of-Day Greeting ─────────────────────────────────────────────────────

function getTimeGreeting(): { text: string; emoji: string } {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 12) return { text: 'Good morning', emoji: '☀️' }
  if (hour >= 12 && hour < 17) return { text: 'Good afternoon', emoji: '🌤️' }
  if (hour >= 17 && hour < 21) return { text: 'Good evening', emoji: '🌅' }
  return { text: 'Good night', emoji: '🌙' }
}

function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return 'UTC'
  }
}

function getLocalHour(): number {
  return new Date().getHours()
}

// ─── Skeleton Loading Component ───────────────────────────────────────────────

function BriefSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="text-center space-y-3">
        <div className="h-5 w-48 bg-white/10 rounded-full mx-auto" />
        <div className="h-4 w-72 bg-white/5 rounded-full mx-auto" />
      </div>
      <div className="h-px bg-white/10" />
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <div className="w-6 h-6 rounded-full bg-white/10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-3/4 bg-white/10 rounded" />
              <div className="h-3 w-1/2 bg-white/5 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Confirm Modal Component ──────────────────────────────────────────────────

function ConfirmModal({
  isOpen,
  onConfirm,
  onCancel,
  remaining,
}: {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
  remaining: number
}) {
  if (!isOpen) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full max-w-sm rounded-2xl p-6 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(20, 20, 30, 0.98), rgba(10, 10, 18, 0.99))',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 60px rgba(251, 191, 36, 0.05)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <RefreshCw className="w-8 h-8 mx-auto mb-4" style={{ color: 'rgba(251, 191, 36, 0.7)' }} />
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: 'rgba(255, 255, 255, 0.9)' }}
        >
          Regenerate Mission?
        </h3>
        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: 'rgba(255, 255, 255, 0.5)' }}
        >
          This will create a fresh new mission for today.
          <br />
          <span style={{ color: 'rgba(251, 191, 36, 0.7)' }}>
            {remaining} regeneration{remaining !== 1 ? 's' : ''} remaining today
          </span>
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:bg-white/10"
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: 'rgba(255, 255, 255, 0.6)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(251, 191, 36, 0.2), rgba(245, 158, 11, 0.15))',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              color: 'rgba(251, 191, 36, 0.95)',
              cursor: 'pointer',
            }}
          >
            Regenerate
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TodayMissionClient() {
  const [brief, setBrief] = useState<DailyBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [regenerationsRemaining, setRegenerationsRemaining] = useState(1)
  const [maxGenerations, setMaxGenerations] = useState(1)
  // Track which tasks have been completed locally to prevent revert
  const [completedTaskIds, setCompletedTaskIds] = useState<Set<string>>(new Set())

  // ── Fetch or generate brief on mount ──────────────────────────────────────

  const fetchBrief = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Step 1: Try GET
      const getRes = await fetch('/api/v1/daily-brief', { cache: 'no-store' })
      if (!getRes.ok) {
        if (getRes.status === 401) {
          setError('Please sign in to view your daily mission.')
          return
        }
        throw new Error(`GET failed: ${getRes.status}`)
      }

      const getData = await getRes.json()

      if (getData.data?.regenerationsRemaining !== undefined) {
        setRegenerationsRemaining(getData.data.regenerationsRemaining)
      }
      if (getData.data?.maxGenerations !== undefined) {
        setMaxGenerations(getData.data.maxGenerations)
      }

      if (getData.data?.brief) {
        setBrief(getData.data.brief)
        // Track already completed tasks
        const alreadyCompleted = new Set<string>()
        for (const task of getData.data.brief.tasks) {
          if (task.completed) alreadyCompleted.add(task.id)
        }
        setCompletedTaskIds(alreadyCompleted)
        return
      }

      // Step 2: No brief exists — trigger generation via POST
      setGenerating(true)
      const tz = getUserTimezone()
      const localHour = getLocalHour()
      const postRes = await fetch(`/api/v1/daily-brief?tz=${encodeURIComponent(tz)}&hour=${localHour}`, { method: 'POST' })

      if (!postRes.ok) {
        if (postRes.status === 429) {
          const errData = await postRes.json().catch(() => ({}))
          setError(errData.error || "You've used all your daily regenerations. Come back tomorrow.")
          return
        }
        throw new Error(`POST failed: ${postRes.status}`)
      }

      const postData = await postRes.json()

      if (postData.data?.regenerationsRemaining !== undefined) {
        setRegenerationsRemaining(postData.data.regenerationsRemaining)
      }
      if (postData.data?.maxGenerations !== undefined) {
        setMaxGenerations(postData.data.maxGenerations)
      }

      if (postData.data?.brief) {
        setBrief(postData.data.brief)
      }
    } catch (err) {
      console.error('[TodayMission] Error:', err)
      setError('Something went wrong loading your mission. Try refreshing.')
    } finally {
      setLoading(false)
      setGenerating(false)
    }
  }, [])

  useEffect(() => {
    fetchBrief()
  }, [fetchBrief])

  // ── Task completion handler ───────────────────────────────────────────────

  const handleTaskToggle = useCallback(async (taskId: string) => {
    if (!brief) return

    // Prevent re-toggling already completed tasks
    if (completedTaskIds.has(taskId)) return

    // Optimistic update — mark checked immediately
    setCompletedTaskIds(prev => new Set(prev).add(taskId))
    setBrief((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, completed: true, completedAt: Date.now() } : t,
        ),
      }
    })

    try {
      const res = await fetch(`/api/v1/daily-brief/tasks/${taskId}`, {
        method: 'PATCH',
      })

      if (!res.ok) {
        if (res.status === 403) {
          // Cloudflare KV Eventual Consistency: The edge node might be reading a stale KV cache
          // and doesn't see the newly generated task ID yet.
          // Keep it marked as checked in the UI and silently retry after a delay.
          setTimeout(() => {
            fetch(`/api/v1/daily-brief/tasks/${taskId}`, { method: 'PATCH' }).catch(() => {})
          }, 2500)
          return
        }
        console.error(`[TodayMission] PATCH failed: ${res.status}`)
      }
    } catch (err) {
      console.error('[TodayMission] Network error toggling task:', err)
      // We explicitly do NOT revert the optimistic update here.
      // Reverting causes a jarring "bouncing checkbox" UX if the user's connection flickers
      // or if Cloudflare KV is slightly delayed.
    }
  }, [brief, completedTaskIds])

  // ── Regenerate handler ────────────────────────────────────────────────────

  const handleRegenerate = useCallback(async () => {
    setShowConfirm(false)

    try {
      setGenerating(true)
      setError(null)

      const tz = getUserTimezone()
      const localHour = getLocalHour()
      const res = await fetch(`/api/v1/daily-brief?refresh=true&tz=${encodeURIComponent(tz)}&hour=${localHour}`, { method: 'POST' })

      if (res.status === 429) {
        const errData = await res.json().catch(() => ({}))
        setError(errData.error || "You've used all your daily regenerations. Come back tomorrow.")
        setRegenerationsRemaining(0)
        return
      }

      if (!res.ok) throw new Error(`Regenerate failed: ${res.status}`)

      const data = await res.json()

      if (data.data?.regenerationsRemaining !== undefined) {
        setRegenerationsRemaining(data.data.regenerationsRemaining)
      }
      if (data.data?.maxGenerations !== undefined) {
        setMaxGenerations(data.data.maxGenerations)
      }

      if (data.data?.brief) {
        setBrief(data.data.brief)
        // Reset completed task tracking for new brief
        const alreadyCompleted = new Set<string>()
        for (const task of data.data.brief.tasks) {
          if (task.completed) alreadyCompleted.add(task.id)
        }
        setCompletedTaskIds(alreadyCompleted)
      }
    } catch {
      setError('Failed to regenerate. Please try again.')
    } finally {
      setGenerating(false)
    }
  }, [])

  // ── Derived state ─────────────────────────────────────────────────────────

  const completedCount = brief?.tasks.filter((t) => t.completed).length ?? 0
  const totalCount = brief?.tasks.length ?? 0
  const allComplete = totalCount > 0 && completedCount === totalCount
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen text-white flex flex-col items-center px-4 py-8 md:py-12"
      style={{
        background: 'linear-gradient(180deg, #0a0a0f 0%, #0d0d17 40%, #0a0a0f 100%)',
        fontFamily: 'var(--font-body)',
      }}
    >
      {/* Back nav */}
      <div className="w-full max-w-lg mb-8">
        <Link
          href="/chat"
          className="inline-flex items-center gap-2 text-sm opacity-50 hover:opacity-100 transition-opacity"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Missi
        </Link>
      </div>

      {/* Date label */}
      <p
        className="text-xs font-medium tracking-widest uppercase mb-3"
        style={{ color: 'rgba(255,255,255,0.35)' }}
      >
        {formatDate()}
      </p>

      {/* Time-aware heading */}
      <h1 className="text-3xl md:text-4xl font-semibold mb-8 text-center">
        {getTimeGreeting().text} {getTimeGreeting().emoji}
      </h1>

      {/* Error state */}
      {error && (
        <div
          className="w-full max-w-lg mb-6 px-5 py-4 rounded-2xl text-sm text-center"
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: 'rgba(255, 180, 180, 0.9)',
          }}
        >
          {error}
        </div>
      )}

      {/* Mission Card */}
      <div
        className="w-full max-w-lg rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(255,255,255,0.04)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderTop: '2px solid rgba(251, 191, 36, 0.4)',
          boxShadow: '0 0 60px rgba(251, 191, 36, 0.03), 0 25px 50px rgba(0,0,0,0.4)',
        }}
      >
        {/* Progress bar */}
        {brief && !loading && (
          <div className="px-6 pt-5 pb-0">
            <div className="flex items-center justify-between mb-2">
              <span
                className="text-[11px] font-medium"
                style={{ color: allComplete ? 'rgba(167, 243, 208, 0.9)' : 'rgba(255,255,255,0.4)' }}
              >
                {allComplete
                  ? 'All done! 🎉 Missi is proud of you.'
                  : `${completedCount} of ${totalCount} complete`}
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: allComplete
                    ? 'linear-gradient(90deg, #34d399, #6ee7b7)'
                    : 'linear-gradient(90deg, #fbbf24, #f59e0b)',
                }}
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
          </div>
        )}

        <div className="p-6 space-y-6">
          {loading || generating ? (
            <>
              {generating && (
                <p
                  className="text-center text-xs font-medium"
                  style={{ color: 'rgba(251, 191, 36, 0.7)' }}
                >
                  ✨ Generating your daily mission...
                </p>
              )}
              <BriefSkeleton />
            </>
          ) : brief ? (
            <>
              {/* Greeting */}
              <p
                className="text-center text-lg md:text-xl font-medium leading-relaxed"
                style={{ color: 'rgba(255,255,255,0.95)', letterSpacing: '-0.01em' }}
              >
                {brief.greeting}
              </p>

              {/* Separator */}
              <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

              {/* Section label */}
              <p
                className="text-[10px] font-semibold tracking-[0.2em] uppercase"
                style={{ color: 'rgba(255,255,255,0.3)' }}
              >
                YOUR FOCUS TODAY
              </p>

              {/* Task list */}
              <div className="space-y-3">
                <AnimatePresence mode="popLayout">
                  {brief.tasks.map((task) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                    >
                      <TaskRow task={task} onToggle={handleTaskToggle} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Streak Nudge */}
      {brief?.streakNudge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-5 w-full max-w-lg"
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm"
            style={{
              background: 'rgba(251, 146, 60, 0.1)',
              border: '1px solid rgba(251, 146, 60, 0.15)',
              color: 'rgba(251, 191, 36, 0.9)',
            }}
          >
            <Flame className="w-4 h-4 flex-shrink-0" style={{ color: '#fb923c' }} />
            <span>{brief.streakNudge}</span>
          </div>
        </motion.div>
      )}

      {/* Mood Prompt */}
      {brief?.moodPrompt && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-4 w-full max-w-lg"
        >
          <div
            className="flex items-start gap-3 px-5 py-4 rounded-2xl"
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <MessageCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(167, 139, 250, 0.7)' }} />
            <div className="flex-1">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
                {brief.moodPrompt}
              </p>
              <Link
                href="/chat?prefill=mood-checkin"
                className="inline-block mt-2 text-xs font-medium px-3 py-1.5 rounded-full transition-all hover:opacity-80"
                style={{
                  background: 'rgba(167, 139, 250, 0.1)',
                  border: '1px solid rgba(167, 139, 250, 0.2)',
                  color: 'rgba(167, 139, 250, 0.9)',
                }}
              >
                Tell Missi
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* Challenge */}
      {brief?.challenge && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-4 w-full max-w-lg"
        >
          <div
            className="flex items-start gap-3 px-5 py-4 rounded-2xl"
            style={{
              background: 'rgba(250, 204, 21, 0.04)',
              border: '1px solid rgba(250, 204, 21, 0.12)',
            }}
          >
            <Zap className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'rgba(250, 204, 21, 0.8)' }} />
            <div>
              <p
                className="text-[10px] font-semibold tracking-[0.15em] uppercase mb-1"
                style={{ color: 'rgba(250, 204, 21, 0.5)' }}
              >
                TODAY&apos;S CHALLENGE
              </p>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                {brief.challenge}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Regenerate button */}
      {brief && !generating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-8 w-full max-w-lg flex justify-end items-center gap-3"
        >
          {regenerationsRemaining > 0 && (
            <span
              className="text-[10px] font-medium"
              style={{ color: 'rgba(255, 255, 255, 0.2)' }}
            >
              {regenerationsRemaining} left today
            </span>
          )}
          <button
            onClick={() => {
              if (regenerationsRemaining <= 0) {
                setError(
                  maxGenerations === 1
                    ? 'Free plan allows 1 daily brief per day. Upgrade to Plus for more.'
                    : "You've used all your daily regenerations. Come back tomorrow."
                )
                return
              }
              setShowConfirm(true)
            }}
            disabled={regenerationsRemaining <= 0}
            className="flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-80 disabled:opacity-20 disabled:cursor-not-allowed"
            style={{ color: 'rgba(255,255,255,0.25)' }}
          >
            <RefreshCw className="w-3 h-3" />
            Regenerate
          </button>
        </motion.div>
      )}

      {/* Confirm Modal */}
      <AnimatePresence>
        {showConfirm && (
          <ConfirmModal
            isOpen={showConfirm}
            onConfirm={handleRegenerate}
            onCancel={() => setShowConfirm(false)}
            remaining={regenerationsRemaining}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Task Row Component ───────────────────────────────────────────────────────

function TaskRow({
  task,
  onToggle,
}: {
  task: DailyTask
  onToggle: (id: string) => void
}) {
  const badge = SOURCE_BADGES[task.source]

  return (
    <div
      className="flex items-start gap-3 group"
      style={{ opacity: task.completed ? 0.45 : 1 }}
    >
      {/* Checkbox */}
      <button
        onClick={() => !task.completed && onToggle(task.id)}
        className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all"
        style={{
          borderColor: task.completed ? 'rgba(52, 211, 153, 0.6)' : 'rgba(255,255,255,0.15)',
          background: task.completed ? 'rgba(52, 211, 153, 0.15)' : 'transparent',
          cursor: task.completed ? 'default' : 'pointer',
        }}
        disabled={task.completed}
      >
        <AnimatePresence>
          {task.completed && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              <Check className="w-3.5 h-3.5" style={{ color: '#34d399' }} />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[15px] font-medium leading-snug"
          style={{
            color: 'rgba(255,255,255,0.9)',
            textDecoration: task.completed ? 'line-through' : 'none',
          }}
        >
          {task.title}
        </p>
        <p
          className="text-xs mt-0.5 leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.35)' }}
        >
          {task.context}
        </p>
      </div>

      {/* Source badge */}
      <span
        className="flex-shrink-0 text-[10px] font-medium px-2 py-1 rounded-full mt-1"
        style={{
          color: badge.color,
          background: `${badge.color}15`,
          border: `1px solid ${badge.color}20`,
        }}
      >
        {badge.icon} {badge.label}
      </span>
    </div>
  )
}
