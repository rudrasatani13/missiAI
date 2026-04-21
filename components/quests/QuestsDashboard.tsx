'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useQuests } from '@/hooks/useQuests'
import { QuestCard } from './QuestCard'
import { QuestCreator } from './QuestCreator'
import { QuestDetail } from './QuestDetail'
import { QuestCompleteModal } from './QuestCompleteModal'
import type { Quest } from '@/types/quests'

export function QuestsDashboard() {
  const {
    quests,
    activeCount,
    stats,
    isLoading,
    error,
    setError,
    createQuest,
    updateQuestStatus,
    completeMission,
    getBossToken,
    fetchQuests,
    fetchStats,
  } = useQuests()

  const [view, setView] = useState<'list' | 'create' | 'detail'>('list')
  const [selectedQuest, setSelectedQuest] = useState<Quest | null>(null)
  const [completedQuest, setCompletedQuest] = useState<Quest | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all')

  const handleSelectQuest = useCallback((quest: Quest) => {
    setSelectedQuest(quest)
    setView('detail')
  }, [])

  const handleCreate = useCallback(async (data: {
    userGoal: string
    category: string
    difficulty: string
    targetDurationDays: number
  }) => {
    setIsCreating(true)
    try {
      const quest = await createQuest(data)
      if (quest) {
        setSelectedQuest(quest)
        setView('detail')
        fetchStats()
      }
    } finally {
      setIsCreating(false)
    }
  }, [createQuest, fetchStats])

  const handleQuestComplete = useCallback((quest: Quest) => {
    setCompletedQuest(quest)
    fetchQuests()
    fetchStats()
  }, [fetchQuests, fetchStats])

  // Filter quests
  const filteredQuests = filter === 'all'
    ? quests
    : quests.filter(q => q.status === filter)

  // Refresh selected quest from the quests list
  const currentSelectedQuest = selectedQuest
    ? quests.find(q => q.id === selectedQuest.id) ?? selectedQuest
    : null

  if (view === 'create') {
    return (
      <div className="min-h-screen pt-20 pb-12 px-4">
        <QuestCreator
          onSubmit={handleCreate}
          onCancel={() => setView('list')}
          isLoading={isCreating}
        />
      </div>
    )
  }

  if (view === 'detail' && currentSelectedQuest) {
    return (
      <div className="min-h-screen pt-20 pb-12 px-4">
        <QuestDetail
          quest={currentSelectedQuest}
          onCompleteMission={completeMission}
          onGetBossToken={getBossToken}
          onUpdateStatus={async (questId, action) => {
            const result = await updateQuestStatus(questId, action)
            if (result) {
              setSelectedQuest(result)
            }
          }}
          onBack={() => {
            setView('list')
            setSelectedQuest(null)
            fetchQuests()
          }}
          onQuestComplete={handleQuestComplete}
        />

        {completedQuest && (
          <QuestCompleteModal
            quest={completedQuest}
            onClose={() => setCompletedQuest(null)}
          />
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen pt-20 pb-12 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link
              href="/streak"
              className="p-2 rounded-full transition-all hover:bg-white/10"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              ←
            </Link>
            <div>
              <h1
                className="text-xl font-bold"
                style={{ color: 'rgba(255,255,255,0.92)' }}
              >
                Quests
              </h1>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                Turn goals into journeys
              </p>
            </div>
          </div>
          <button
            onClick={() => setView('create')}
            className="px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.03]"
            style={{
              background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
              color: '#000',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            + New Quest
          </button>
        </div>

        {/* Stats row */}
        {stats && (
          <div
            className="grid grid-cols-4 gap-2 mb-6 rounded-xl p-3"
            style={{
              background: 'rgba(20,20,26,0.55)',
              backdropFilter: 'blur(24px)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <StatBox label="Active" value={stats.activeQuests} color="#34D399" />
            <StatBox label="Done" value={stats.completedQuests} color="#FBBF24" />
            <StatBox label="Missions" value={stats.totalMissionsCompleted} color="#60A5FA" />
            <StatBox label="XP" value={stats.totalQuestXP} color="rgba(255,200,50,0.8)" />
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {(['all', 'active', 'completed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all capitalize"
              style={{
                background: filter === f ? 'rgba(251,191,36,0.12)' : 'rgba(255,255,255,0.03)',
                color: filter === f ? '#FBBF24' : 'rgba(255,255,255,0.4)',
                border: filter === f
                  ? '1px solid rgba(251,191,36,0.2)'
                  : '1px solid rgba(255,255,255,0.06)',
                cursor: 'pointer',
              }}
            >
              {f}
              {f === 'active' && activeCount > 0 && (
                <span className="ml-1" style={{ color: '#34D399' }}>({activeCount})</span>
              )}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div
            className="rounded-xl px-4 py-3 mb-4 flex items-center justify-between"
            style={{
              background: 'rgba(248,113,113,0.08)',
              border: '1px solid rgba(248,113,113,0.15)',
            }}
          >
            <p className="text-xs" style={{ color: 'rgba(248,113,113,0.9)' }}>{error}</p>
            <button
              onClick={() => setError(null)}
              className="text-xs"
              style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-12">
            <div
              className="w-6 h-6 rounded-full border-2 border-white/10 border-t-white/60"
              style={{ animation: 'spin 0.8s linear infinite' }}
            />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && filteredQuests.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🗺️</p>
            <p className="text-sm font-medium mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {filter === 'all' ? 'No quests yet' : `No ${filter} quests`}
            </p>
            <p className="text-xs mb-6" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {filter === 'all'
                ? 'Start your first quest and turn a goal into a journey'
                : 'Try changing the filter'}
            </p>
            {filter === 'all' && (
              <button
                onClick={() => setView('create')}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold transition-all hover:scale-[1.03]"
                style={{
                  background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(234,179,8,0.08))',
                  color: '#FBBF24',
                  border: '1px solid rgba(251,191,36,0.2)',
                  cursor: 'pointer',
                }}
              >
                Create Your First Quest
              </button>
            )}
          </div>
        )}

        {/* Quest grid */}
        {!isLoading && filteredQuests.length > 0 && (
          <div className="flex flex-col gap-3">
            {filteredQuests.map(quest => (
              <QuestCard
                key={quest.id}
                quest={quest}
                onSelect={handleSelectQuest}
              />
            ))}
          </div>
        )}
      </div>

      {/* Celebration modal */}
      {completedQuest && (
        <QuestCompleteModal
          quest={completedQuest}
          onClose={() => setCompletedQuest(null)}
        />
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

// ─── Stat Box ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
      <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</p>
    </div>
  )
}
