'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, RefreshCw, Zap } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { DailyBrief, DailyTask } from '@/types/daily-brief'

// ─── Source Badge Config ──────────────────────────────────────────────────────

const SOURCE_BADGES: Record<DailyTask['source'], { label: string }> = {
  goal: { label: 'Goal' },
  calendar: { label: 'Calendar' },
  challenge: { label: 'Challenge' },
  missi: { label: 'Missi' },
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
    <div className="animate-pulse space-y-8">
      <div className="text-center space-y-3">
        <div className="h-4 w-64 bg-[var(--missi-nav-hover)] rounded mx-auto" />
        <div className="h-3 w-48 bg-[var(--missi-nav-hover)] rounded mx-auto" />
      </div>
      <div className="space-y-5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-4 py-2">
            <div className="w-5 h-5 rounded-full bg-[var(--missi-nav-hover)] flex-shrink-0 mt-1" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-16 bg-[var(--missi-nav-hover)] rounded" />
              <div className="h-4 w-3/4 bg-[var(--missi-nav-hover)] rounded" />
              <div className="h-3 w-1/2 bg-[var(--missi-nav-hover)] rounded" />
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
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-sm rounded-2xl p-7 text-left"
        style={{
          background: 'rgba(20, 20, 26, 0.85)',
          backdropFilter: 'blur(24px) saturate(140%)',
          WebkitBackdropFilter: 'blur(24px) saturate(140%)',
          border: '1px solid var(--missi-border)',
          boxShadow: '0 20px 50px -20px rgba(0,0,0,0.6), inset 0 1px 0 var(--missi-border)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          className="mb-3 text-[10px] font-semibold uppercase"
          style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
        >
          Regenerate
        </p>
        <h3
          className="mb-2 text-[22px] font-medium"
          style={{ color: 'var(--missi-text-primary)', letterSpacing: '-0.02em' }}
        >
          Regenerate mission?
        </h3>
        <p
          className="mb-6 text-sm leading-relaxed"
          style={{ color: 'var(--missi-text-secondary)' }}
        >
          This replaces today&apos;s focus with a new one.{' '}
          <span style={{ color: 'var(--missi-text-secondary)' }}>
            {remaining} left today.
          </span>
        </p>
        <div className="flex gap-2.5">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
            style={{
              background: 'transparent',
              border: '1px solid var(--missi-border)',
              color: 'var(--missi-text-secondary)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
            style={{
              background: 'var(--missi-nav-text-active)',
              border: '1px solid var(--missi-border-strong)',
              color: 'var(--missi-bg)',
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

  const greeting = getTimeGreeting()

  return (
    <div
      className="relative min-h-full flex flex-col items-center px-4 py-8 md:py-12"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* Ambient field — warm amber. Absolute so it stays inside the shell card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            'radial-gradient(520px circle at 15% 10%, rgba(251,191,36,0.06), transparent 60%), radial-gradient(480px circle at 85% 90%, rgba(245,158,11,0.05), transparent 65%)',
          filter: 'blur(120px)',
        }}
      />

      {/* Sidebar provides navigation — no Back link needed. */}

      {/* Hero — eyebrow + greeting */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg flex flex-col items-center text-center mb-12"
      >
        <p
          className="mb-4 text-[10px] font-semibold uppercase"
          style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
        >
          {formatDate()}
        </p>
        <h1
          className="text-[32px] md:text-[40px]"
          style={{
            fontWeight: 300,
            letterSpacing: '-0.03em',
            color: 'var(--missi-text-primary)',
            lineHeight: 1.1,
          }}
        >
          {greeting.text}
        </h1>

        {/* Regenerations-remaining meter */}
        {brief && !loading && maxGenerations > 0 && (
          <div className="mt-7 w-32">
            <div
              className="h-[2px] rounded-full overflow-hidden"
              style={{ background: 'var(--missi-border)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'var(--missi-border)' }}
                initial={{ width: 0 }}
                animate={{
                  width: `${(regenerationsRemaining / Math.max(maxGenerations, 1)) * 100}%`,
                }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <p
              className="mt-2 text-[10px] font-semibold uppercase"
              style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
            >
              {regenerationsRemaining} of {maxGenerations} left
            </p>
          </div>
        )}
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative z-10 w-full max-w-lg mb-8 px-5 py-4 rounded-xl text-sm"
          style={{
            background: 'var(--missi-surface)',
            border: '1px solid rgba(239,68,68,0.18)',
            color: 'rgba(255,180,180,0.85)',
          }}
        >
          {error}
        </motion.div>
      )}

      {/* Mission body — flat, no card */}
      <div className="relative z-10 w-full max-w-lg">
        {loading || generating ? (
          <>
            {generating && (
              <p
                className="mb-6 text-center text-[10px] font-semibold uppercase"
                style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
              >
                Generating your mission
              </p>
            )}
            <BriefSkeleton />
          </>
        ) : brief ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="space-y-10"
          >
            {/* Greeting line */}
            <p
              className="text-center text-[17px] md:text-[18px] leading-relaxed"
              style={{
                color: 'var(--missi-text-secondary)',
                letterSpacing: '-0.01em',
                fontWeight: 400,
              }}
            >
              {brief.greeting}
            </p>

            {/* Focus section */}
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-5">
                <p
                  className="text-[10px] font-semibold uppercase"
                  style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
                >
                  Focus today
                </p>
                <p
                  className="text-[10px] font-semibold uppercase"
                  style={{
                    color: allComplete ? 'rgba(167,243,208,0.75)' : 'var(--missi-text-muted)',
                    letterSpacing: '0.18em',
                  }}
                >
                  {allComplete ? 'All done' : `${completedCount} / ${totalCount}`}
                </p>
              </div>

              {/* Thin progress rail */}
              <div
                className="h-[2px] rounded-full overflow-hidden mb-6"
                style={{ background: 'var(--missi-border)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: allComplete
                      ? 'rgba(167,243,208,0.55)'
                      : 'var(--missi-text-muted)',
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                />
              </div>

              {/* Task list — flat rows with hairline dividers */}
              <div>
                <AnimatePresence mode="popLayout">
                  {brief.tasks.map((task, idx) => (
                    <motion.div
                      key={task.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.06 }}
                    >
                      <TaskRow
                        task={task}
                        onToggle={handleTaskToggle}
                        isLast={idx === brief.tasks.length - 1}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Challenge */}
            {brief.challenge && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                className="flex items-start gap-3 px-5 py-4 rounded-xl"
                style={{
                  background: 'var(--missi-surface)',
                  border: '1px solid var(--missi-border)',
                }}
              >
                <Zap
                  className="w-3.5 h-3.5 mt-[3px] flex-shrink-0"
                  style={{ color: 'var(--missi-text-secondary)' }}
                />
                <div className="flex-1">
                  <p
                    className="mb-1 text-[10px] font-semibold uppercase"
                    style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
                  >
                    Challenge
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--missi-text-secondary)' }}>
                    {brief.challenge}
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        ) : null}
      </div>

      {/* Ghost regenerate button */}
      {brief && !generating && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
          className="relative z-10 mt-10 w-full max-w-lg flex justify-end items-center"
        >
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
            className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors disabled:opacity-20 disabled:cursor-not-allowed active:scale-[0.97]"
            style={{
              color: 'var(--missi-text-muted)',
              background: 'transparent',
              padding: '6px 2px',
            }}
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
  isLast,
}: {
  task: DailyTask
  onToggle: (id: string) => void
  isLast?: boolean
}) {
  const badge = SOURCE_BADGES[task.source]

  return (
    <div
      className="flex items-start gap-4 py-4 transition-opacity"
      style={{
        opacity: task.completed ? 0.5 : 1,
        borderBottom: isLast ? 'none' : '1px solid var(--missi-border)',
      }}
    >
      {/* Check circle */}
      <button
        onClick={() => !task.completed && onToggle(task.id)}
        className="mt-[2px] flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors active:scale-[0.97]"
        style={{
          border: `1px solid ${task.completed ? 'var(--missi-border-strong)' : 'var(--missi-border-strong)'}`,
          background: task.completed ? 'var(--missi-border)' : 'transparent',
          cursor: task.completed ? 'default' : 'pointer',
        }}
        disabled={task.completed}
        aria-label={task.completed ? 'Task complete' : 'Mark task complete'}
      >
        <AnimatePresence>
          {task.completed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <Check className="w-3 h-3" style={{ color: 'var(--missi-text-primary)' }} strokeWidth={2.5} />
            </motion.div>
          )}
        </AnimatePresence>
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className="mb-1.5 text-[10px] font-semibold uppercase"
          style={{ color: 'var(--missi-text-muted)', letterSpacing: '0.18em' }}
        >
          {badge.label}
        </p>
        <p
          className="text-[15px] leading-snug mb-1"
          style={{
            color: 'var(--missi-text-primary)',
            fontWeight: 500,
            letterSpacing: '-0.01em',
          }}
        >
          {task.title}
        </p>
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: 'var(--missi-text-secondary)' }}
        >
          {task.context}
        </p>
      </div>
    </div>
  )
}
