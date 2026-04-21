'use client'

import { useState, useCallback } from 'react'
import { ArrowLeft, Plus, Sword, Check } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuests } from '@/hooks/useQuests'
import { QuestCreator } from './QuestCreator'
import { QuestCompleteModal } from './QuestCompleteModal'
import type { Quest, QuestMission } from '@/types/quests'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  health: '#34D399', learning: '#60A5FA', creativity: '#F472B6',
  relationships: '#FBBF24', career: '#A78BFA', mindfulness: '#2DD4BF', other: '#94A3B8',
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function QuestSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {[1, 2].map(i => (
        <div key={i} className="space-y-3 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="h-3 w-20 rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
          <div className="h-4 w-3/4 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="h-[2px] w-full rounded" style={{ background: 'rgba(255,255,255,0.04)' }} />
        </div>
      ))}
    </div>
  )
}

// ─── Quest Row ────────────────────────────────────────────────────────────────

function QuestRow({
  quest,
  onSelect,
  isLast,
  delay = 0,
}: {
  quest: Quest
  onSelect: () => void
  isLast: boolean
  delay?: number
}) {
  const pct = quest.totalMissions > 0
    ? Math.round((quest.completedMissions / quest.totalMissions) * 100)
    : 0
  const color = CATEGORY_COLORS[quest.category] ?? '#94A3B8'
  const isComplete = quest.status === 'completed'

  // Find next mission
  let nextMission = ''
  if (quest.status === 'active') {
    for (const ch of quest.chapters) {
      for (const m of ch.missions) {
        if (m.status === 'available') { nextMission = m.title; break }
      }
      if (nextMission) break
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <button
        onClick={onSelect}
        className="w-full text-left py-5 transition-opacity active:scale-[0.99]"
        style={{
          borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
          background: 'none',
          border: 'none',
          borderBottomStyle: isLast ? 'none' : 'solid',
          borderBottomWidth: isLast ? 0 : 1,
          borderBottomColor: 'rgba(255,255,255,0.05)',
          cursor: 'pointer',
          padding: '20px 0',
          display: 'block',
          width: '100%',
        }}
      >
        <div className="flex items-start gap-3.5">
          {/* Emoji */}
          <span className="text-xl mt-0.5 flex-shrink-0">{quest.coverEmoji}</span>

          <div className="flex-1 min-w-0">
            {/* Eyebrow: category */}
            <p
              className="mb-1.5 text-[10px] font-semibold uppercase"
              style={{ color, letterSpacing: '0.18em' }}
            >
              {quest.category}
            </p>

            {/* Title */}
            <p
              className="text-[15px] leading-snug mb-1"
              style={{
                color: isComplete ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.88)',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                textDecoration: isComplete ? 'line-through' : 'none',
              }}
            >
              {quest.title}
            </p>

            {/* Next mission preview */}
            {nextMission && (
              <p className="text-[13px] leading-relaxed mb-2.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Next: {nextMission}
              </p>
            )}

            {/* Progress rail */}
            <div className="flex items-center gap-3">
              <div
                className="flex-1 h-[2px] rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    background: isComplete
                      ? 'rgba(167,243,208,0.5)'
                      : `${color}80`,
                  }}
                />
              </div>
              <span
                className="text-[10px] font-semibold flex-shrink-0"
                style={{ color: isComplete ? 'rgba(167,243,208,0.6)' : 'rgba(255,255,255,0.35)' }}
              >
                {isComplete ? 'Done' : `${quest.completedMissions}/${quest.totalMissions}`}
              </span>
            </div>
          </div>
        </div>
      </button>
    </motion.div>
  )
}

// ─── Mission Row (Detail View) ────────────────────────────────────────────────

function MissionRow({
  mission,
  color,
  isLoading,
  isActive,
  onComplete,
  isLast,
}: {
  mission: QuestMission
  color: string
  isLoading: boolean
  isActive: boolean
  onComplete: () => void
  isLast: boolean
}) {
  const done = mission.status === 'completed'
  const locked = mission.status === 'locked'

  return (
    <div
      className="flex items-start gap-4 py-4 transition-opacity"
      style={{
        opacity: locked ? 0.3 : done ? 0.5 : 1,
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Check circle */}
      <button
        onClick={() => !done && !locked && isActive && onComplete()}
        disabled={done || locked || !isActive || isLoading}
        className="mt-[2px] flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center transition-colors active:scale-[0.97]"
        style={{
          border: `1px solid ${done ? color + '60' : 'rgba(255,255,255,0.18)'}`,
          background: done ? color + '15' : 'transparent',
          cursor: done || locked || !isActive ? 'default' : 'pointer',
        }}
        aria-label={done ? 'Mission complete' : 'Mark mission complete'}
      >
        <AnimatePresence>
          {done && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            >
              <Check className="w-3 h-3" style={{ color }} strokeWidth={2.5} />
            </motion.div>
          )}
        </AnimatePresence>
        {isLoading && (
          <div
            className="w-3 h-3 rounded-full border border-white/20 border-t-white/60"
            style={{ animation: 'spin 0.7s linear infinite' }}
          />
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {mission.isBoss && (
          <p
            className="mb-1 text-[10px] font-semibold uppercase"
            style={{ color: 'rgba(248,113,113,0.7)', letterSpacing: '0.18em' }}
          >
            Boss Battle
          </p>
        )}
        <p
          className="text-[15px] leading-snug mb-0.5"
          style={{
            color: done ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.88)',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          {mission.title}
        </p>
        {mission.description && !locked && (
          <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {mission.description}
          </p>
        )}
      </div>

      {/* XP */}
      <span
        className="mt-1.5 text-[10px] font-semibold flex-shrink-0"
        style={{ color: 'rgba(255,255,255,0.2)' }}
      >
        +{mission.xpReward}
      </span>
    </div>
  )
}

// ─── Main Client Component ────────────────────────────────────────────────────

export default function QuestsClient() {
  const {
    quests, stats, isLoading, error,
    createQuest, updateQuestStatus, completeMission, getBossToken,
    fetchQuests, fetchStats,
  } = useQuests()

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [loadingMission, setLoadingMission] = useState<string | null>(null)
  const [completedQuest, setCompletedQuest] = useState<Quest | null>(null)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  const selectedQuest = selectedQuestId
    ? quests.find(q => q.id === selectedQuestId) ?? null
    : null

  const filteredQuests = filter === 'all'
    ? quests
    : quests.filter(q => q.status === filter)

  const activeCount = quests.filter(q => q.status === 'active').length

  const handleCreate = useCallback(async (data: {
    userGoal: string; category: string; difficulty: string; targetDurationDays: number
  }) => {
    setIsCreating(true)
    try {
      const quest = await createQuest(data)
      if (quest) {
        setSelectedQuestId(quest.id)
        setView('detail')
        fetchStats()
      }
    } finally {
      setIsCreating(false)
    }
  }, [createQuest, fetchStats])

  const handleCompleteMission = useCallback(async (mission: QuestMission) => {
    if (!selectedQuest || loadingMission) return
    setLoadingMission(mission.id)

    try {
      if (mission.isBoss) {
        const token = await getBossToken(selectedQuest.id)
        if (!token) { setLoadingMission(null); return }
        const result = await completeMission(selectedQuest.id, mission.id, token)
        if (result?.questCompleted) {
          setCompletedQuest(result.quest ?? selectedQuest)
          fetchStats()
        }
      } else {
        const result = await completeMission(selectedQuest.id, mission.id)
        if (result?.questCompleted) {
          setCompletedQuest(result.quest ?? selectedQuest)
          fetchStats()
        }
      }
    } finally {
      setLoadingMission(null)
    }
  }, [selectedQuest, loadingMission, completeMission, getBossToken, fetchStats])

  const handleAction = useCallback(async (action: 'start' | 'abandon' | 'resume') => {
    if (!selectedQuestId) return
    await updateQuestStatus(selectedQuestId, action)
    fetchStats()
  }, [selectedQuestId, updateQuestStatus, fetchStats])

  // ── Detail View ───────────────────────────────────────────────────────────

  if (view === 'detail' && selectedQuest) {
    const color = CATEGORY_COLORS[selectedQuest.category] ?? '#94A3B8'
    const pct = selectedQuest.totalMissions > 0
      ? Math.round((selectedQuest.completedMissions / selectedQuest.totalMissions) * 100)
      : 0
    const isComplete = selectedQuest.status === 'completed'

    return (
      <div className="relative min-h-full flex flex-col items-center px-4 py-8 md:py-12"
        style={{ fontFamily: 'var(--font-body)' }}>
        {/* Ambient */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{
          background: `radial-gradient(520px circle at 15% 10%, ${color}0A, transparent 60%), radial-gradient(480px circle at 85% 90%, ${color}06, transparent 65%)`,
          filter: 'blur(120px)',
        }} />

        {/* Back */}
        <div className="relative z-10 w-full max-w-lg mb-10">
          <button
            onClick={() => { setView('list'); setSelectedQuestId(null); fetchQuests() }}
            className="inline-flex items-center gap-2 text-xs transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Quests
          </button>
        </div>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-lg flex flex-col items-center text-center mb-10"
        >
          <span className="text-4xl mb-4">{selectedQuest.coverEmoji}</span>
          <p
            className="mb-3 text-[10px] font-semibold uppercase"
            style={{ color, letterSpacing: '0.18em' }}
          >
            {selectedQuest.category} · Ch. {
              (() => {
                for (const ch of selectedQuest.chapters) {
                  if (ch.missions.some(m => m.status === 'available')) return ch.chapterNumber
                }
                return selectedQuest.chapters.length
              })()
            } of {selectedQuest.chapters.length}
          </p>
          <h1
            className="text-[28px] md:text-[34px]"
            style={{ fontWeight: 300, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
          >
            {selectedQuest.title}
          </h1>
          <p className="mt-3 text-sm leading-relaxed max-w-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {selectedQuest.description}
          </p>

          {/* Progress rail */}
          <div className="mt-7 w-32">
            <div className="h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: isComplete ? 'rgba(167,243,208,0.55)' : `${color}80` }}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <p className="mt-2 text-[10px] font-semibold uppercase"
              style={{ color: isComplete ? 'rgba(167,243,208,0.6)' : 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}>
              {isComplete ? 'Complete' : `${selectedQuest.completedMissions} of ${selectedQuest.totalMissions}`}
            </p>
          </div>
        </motion.div>

        {/* Action button */}
        {selectedQuest.status === 'draft' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 w-full max-w-lg mb-8">
            <button
              onClick={() => handleAction('start')}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
              style={{ background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(255,255,255,0.9)', color: '#0a0a0f', cursor: 'pointer' }}
            >
              Start Quest
            </button>
          </motion.div>
        )}
        {selectedQuest.status === 'abandoned' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="relative z-10 w-full max-w-lg mb-8">
            <button
              onClick={() => handleAction('resume')}
              className="w-full rounded-xl px-4 py-2.5 text-sm font-medium transition-colors active:scale-[0.97]"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}
            >
              Resume Quest
            </button>
          </motion.div>
        )}

        {/* Missions — flat list grouped by chapter */}
        <div className="relative z-10 w-full max-w-lg">
          {selectedQuest.chapters.map((chapter, ci) => {
            const chapterDone = chapter.missions.every(m => m.status === 'completed')
            return (
              <motion.div
                key={chapter.chapterNumber}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: ci * 0.08 }}
                className="mb-8"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-semibold uppercase"
                    style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}>
                    {chapter.title}
                  </p>
                  {chapterDone && (
                    <p className="text-[10px] font-semibold uppercase"
                      style={{ color: 'rgba(167,243,208,0.6)', letterSpacing: '0.18em' }}>
                      ✓
                    </p>
                  )}
                </div>

                <div>
                  {chapter.missions.map((mission, mi) => (
                    <MissionRow
                      key={mission.id}
                      mission={mission}
                      color={color}
                      isLoading={loadingMission === mission.id}
                      isActive={selectedQuest.status === 'active'}
                      onComplete={() => handleCompleteMission(mission)}
                      isLast={mi === chapter.missions.length - 1}
                    />
                  ))}
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Pause button */}
        {selectedQuest.status === 'active' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="relative z-10 mt-4 w-full max-w-lg flex justify-end"
          >
            <button
              onClick={() => handleAction('abandon')}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors active:scale-[0.97]"
              style={{ color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 2px' }}
            >
              Pause quest
            </button>
          </motion.div>
        )}

        {/* XP footer */}
        {selectedQuest.totalXPEarned > 0 && (
          <p className="relative z-10 mt-8 text-[10px] font-semibold uppercase"
            style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.18em' }}>
            {selectedQuest.totalXPEarned} XP earned
          </p>
        )}

        {completedQuest && <QuestCompleteModal quest={completedQuest} onClose={() => setCompletedQuest(null)} />}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  // ── Create View ───────────────────────────────────────────────────────────

  if (view === 'create') {
    return (
      <div className="relative min-h-full flex flex-col items-center px-4 py-8 md:py-12"
        style={{ fontFamily: 'var(--font-body)' }}>
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0" style={{
          background: 'radial-gradient(520px circle at 15% 10%, rgba(251,191,36,0.06), transparent 60%), radial-gradient(480px circle at 85% 90%, rgba(245,158,11,0.05), transparent 65%)',
          filter: 'blur(120px)',
        }} />
        <div className="relative z-10 w-full max-w-lg mb-10">
          <button
            onClick={() => setView('list')}
            className="inline-flex items-center gap-2 text-xs transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Quests
          </button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-lg"
        >
          <QuestCreator
            onSubmit={handleCreate}
            onCancel={() => setView('list')}
            isLoading={isCreating}
          />
        </motion.div>
      </div>
    )
  }

  // ── List View ─────────────────────────────────────────────────────────────

  return (
    <div
      className="relative min-h-full flex flex-col items-center px-4 py-8 md:py-12"
      style={{ fontFamily: 'var(--font-body)' }}
    >
      {/* Ambient field — warm amber */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: 'radial-gradient(520px circle at 15% 10%, rgba(251,191,36,0.06), transparent 60%), radial-gradient(480px circle at 85% 90%, rgba(245,158,11,0.05), transparent 65%)',
          filter: 'blur(120px)',
        }}
      />

      {/* Sidebar provides navigation — no Back link needed. */}

      {/* Hero */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-lg flex flex-col items-center text-center mb-12"
      >
        <p
          className="mb-4 text-[10px] font-semibold uppercase"
          style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}
        >
          {stats ? `${stats.totalMissionsCompleted} missions completed` : 'Your quests'}
        </p>
        <h1
          className="text-[32px] md:text-[40px]"
          style={{ fontWeight: 300, letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.92)', lineHeight: 1.1 }}
        >
          Quests
        </h1>

        {/* Stats meter */}
        {stats && stats.totalQuests > 0 && (
          <div className="mt-7 w-32">
            <div className="h-[2px] rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'rgba(255,255,255,0.35)' }}
                initial={{ width: 0 }}
                animate={{ width: `${stats.totalQuests > 0 ? (stats.completedQuests / stats.totalQuests) * 100 : 0}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>
            <p className="mt-2 text-[10px] font-semibold uppercase"
              style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.18em' }}>
              {stats.completedQuests} of {stats.totalQuests} done
            </p>
          </div>
        )}
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 w-full max-w-lg mb-8 px-5 py-4 rounded-xl text-sm"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(239,68,68,0.18)', color: 'rgba(255,180,180,0.85)' }}
        >
          {error}
        </motion.div>
      )}

      {/* Filters + New button */}
      <div className="relative z-10 w-full max-w-lg">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            {(['all', 'active', 'completed'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-[10px] font-semibold uppercase transition-colors active:scale-[0.97]"
                style={{
                  color: filter === f ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.25)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  letterSpacing: '0.18em',
                  padding: '4px 8px',
                  borderBottom: filter === f ? '1px solid rgba(255,255,255,0.3)' : '1px solid transparent',
                }}
              >
                {f}{f === 'active' && activeCount > 0 ? ` (${activeCount})` : ''}
              </button>
            ))}
          </div>

          <button
            onClick={() => setView('create')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors active:scale-[0.97] hover:bg-white/[0.04]"
            style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.55)',
              cursor: 'pointer',
            }}
          >
            <Plus className="w-3 h-3" />
            <span className="hidden sm:inline">New Quest</span>
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <QuestSkeleton />
        ) : filteredQuests.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-16"
          >
            <div
              className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <Sword className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.15)' }} />
            </div>
            <p className="text-base font-light mb-2" style={{ color: 'rgba(255,255,255,0.5)' }}>
              {filter === 'all' ? 'No quests yet' : `No ${filter} quests`}
            </p>
            <p className="text-xs font-light mb-6" style={{ color: 'rgba(255,255,255,0.25)' }}>
              {filter === 'all' ? 'Describe a goal and Missi will design a journey.' : 'Try changing the filter.'}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setView('create')}
                className="inline-flex px-5 py-2 rounded-full text-xs font-medium transition-colors active:scale-[0.97]"
                style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.9)', color: '#0a0a0f', cursor: 'pointer' }}
              >
                Create your first quest
              </button>
            )}
          </motion.div>
        ) : (
          <div>
            {filteredQuests.map((quest, i) => (
              <QuestRow
                key={quest.id}
                quest={quest}
                onSelect={() => { setSelectedQuestId(quest.id); setView('detail') }}
                isLast={i === filteredQuests.length - 1}
                delay={i * 0.06}
              />
            ))}
          </div>
        )}
      </div>

      {/* Completion modal */}
      {completedQuest && <QuestCompleteModal quest={completedQuest} onClose={() => setCompletedQuest(null)} />}
    </div>
  )
}
