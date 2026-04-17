'use client'

import { useState, useCallback } from 'react'
import type { Quest, QuestMission, QuestChapter } from '@/types/quests'

interface QuestDetailProps {
  quest: Quest
  onCompleteMission: (questId: string, missionId: string, bossToken?: string) => Promise<any>
  onGetBossToken: (questId: string) => Promise<string | null>
  onUpdateStatus: (questId: string, action: 'start' | 'abandon' | 'resume') => Promise<any>
  onBack: () => void
  onQuestComplete: (quest: Quest) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  health: '#34D399',
  learning: '#60A5FA',
  creativity: '#F472B6',
  relationships: '#FBBF24',
  career: '#A78BFA',
  mindfulness: '#2DD4BF',
  other: '#94A3B8',
}

export function QuestDetail({
  quest,
  onCompleteMission,
  onGetBossToken,
  onUpdateStatus,
  onBack,
  onQuestComplete,
}: QuestDetailProps) {
  const [loadingMission, setLoadingMission] = useState<string | null>(null)
  const [loadingAction, setLoadingAction] = useState(false)
  const [bossMode, setBossMode] = useState(false)

  const categoryColor = CATEGORY_COLORS[quest.category] ?? '#94A3B8'
  const progress = quest.totalMissions > 0
    ? Math.round((quest.completedMissions / quest.totalMissions) * 100)
    : 0

  const handleComplete = useCallback(async (mission: QuestMission) => {
    if (loadingMission) return
    setLoadingMission(mission.id)

    try {
      if (mission.isBoss) {
        // Enter boss mode — get token first
        setBossMode(true)
        const token = await onGetBossToken(quest.id)
        if (!token) {
          setBossMode(false)
          setLoadingMission(null)
          return
        }

        const result = await onCompleteMission(quest.id, mission.id, token)
        setBossMode(false)

        if (result?.questCompleted) {
          onQuestComplete(result.quest ?? quest)
        }
      } else {
        const result = await onCompleteMission(quest.id, mission.id)
        if (result?.questCompleted) {
          onQuestComplete(result.quest ?? quest)
        }
      }
    } finally {
      setLoadingMission(null)
    }
  }, [quest, loadingMission, onCompleteMission, onGetBossToken, onQuestComplete])

  const handleAction = useCallback(async (action: 'start' | 'abandon' | 'resume') => {
    setLoadingAction(true)
    try {
      await onUpdateStatus(quest.id, action)
    } finally {
      setLoadingAction(false)
    }
  }, [quest.id, onUpdateStatus])

  // Check if all non-boss missions are done (for boss unlock state)
  const allMissions = quest.chapters.flatMap(c => c.missions)
  const nonBossComplete = allMissions.filter(m => !m.isBoss).every(m => m.status === 'completed')

  return (
    <div className="w-full max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 rounded-full transition-all hover:bg-white/10"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)' }}
        >
          ←
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{quest.coverEmoji}</span>
            <h1
              className="text-lg font-semibold truncate"
              style={{ color: 'rgba(255,255,255,0.92)' }}
            >
              {quest.title}
            </h1>
          </div>
          <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {quest.description}
          </p>
        </div>
      </div>

      {/* Progress */}
      <div
        className="rounded-xl p-4 mb-6"
        style={{
          background: 'rgba(20,20,26,0.55)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Progress
          </span>
          <span className="text-xs font-semibold" style={{ color: categoryColor }}>
            {progress}%
          </span>
        </div>
        <div
          className="w-full h-2 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${categoryColor}60, ${categoryColor})`,
              boxShadow: `0 0 12px ${categoryColor}30`,
            }}
          />
        </div>
        <div className="flex justify-between mt-2">
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {quest.completedMissions} / {quest.totalMissions} missions
          </span>
          <span className="text-[10px]" style={{ color: 'rgba(255,200,50,0.7)' }}>
            ✦ {quest.totalXPEarned} XP earned
          </span>
        </div>
      </div>

      {/* Action buttons */}
      {quest.status === 'draft' && (
        <button
          onClick={() => handleAction('start')}
          disabled={loadingAction}
          className="w-full py-3 rounded-xl text-sm font-semibold mb-6 transition-all hover:scale-[1.02] disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, #FBBF24, #F59E0B)',
            color: '#000',
            border: 'none',
            cursor: loadingAction ? 'wait' : 'pointer',
          }}
        >
          {loadingAction ? 'Starting...' : 'Start Quest'}
        </button>
      )}

      {quest.status === 'abandoned' && (
        <button
          onClick={() => handleAction('resume')}
          disabled={loadingAction}
          className="w-full py-3 rounded-xl text-sm font-medium mb-6 transition-all hover:scale-[1.02]"
          style={{
            background: 'rgba(251,191,36,0.1)',
            color: '#FBBF24',
            border: '1px solid rgba(251,191,36,0.2)',
            cursor: 'pointer',
          }}
        >
          Resume Quest
        </button>
      )}

      {/* Chapters and Missions */}
      <div className="flex flex-col gap-4">
        {quest.chapters.map((chapter) => (
          <ChapterSection
            key={chapter.chapterNumber}
            chapter={chapter}
            categoryColor={categoryColor}
            loadingMission={loadingMission}
            bossMode={bossMode}
            nonBossComplete={nonBossComplete}
            questStatus={quest.status}
            onComplete={handleComplete}
          />
        ))}
      </div>

      {/* Abandon button */}
      {quest.status === 'active' && (
        <button
          onClick={() => handleAction('abandon')}
          disabled={loadingAction}
          className="w-full py-2 mt-8 mb-4 rounded-xl text-xs font-medium transition-all"
          style={{
            background: 'rgba(248,113,113,0.05)',
            color: 'rgba(248,113,113,0.6)',
            border: '1px solid rgba(248,113,113,0.1)',
            cursor: 'pointer',
          }}
        >
          Pause Quest
        </button>
      )}
    </div>
  )
}

// ─── Chapter Section ──────────────────────────────────────────────────────────

function ChapterSection({
  chapter,
  categoryColor,
  loadingMission,
  bossMode,
  nonBossComplete,
  questStatus,
  onComplete,
}: {
  chapter: QuestChapter
  categoryColor: string
  loadingMission: string | null
  bossMode: boolean
  nonBossComplete: boolean
  questStatus: string
  onComplete: (mission: QuestMission) => void
}) {
  const allDone = chapter.missions.every(m => m.status === 'completed')
  const hasAvailable = chapter.missions.some(m => m.status === 'available')

  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: 'rgba(20,20,26,0.55)',
        backdropFilter: 'blur(24px)',
        border: hasAvailable
          ? `1px solid ${categoryColor}20`
          : '1px solid rgba(255,255,255,0.04)',
        opacity: !hasAvailable && !allDone ? 0.5 : 1,
      }}
    >
      {/* Chapter header */}
      <div className="px-4 py-3 flex items-center justify-between"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wider" style={{ color: categoryColor }}>
            Chapter {chapter.chapterNumber}
          </p>
          <p className="text-xs font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
            {chapter.title}
          </p>
        </div>
        {allDone && (
          <span className="text-xs" style={{ color: '#34D399' }}>✓</span>
        )}
      </div>

      {/* Missions */}
      <div className="px-4 py-2">
        {chapter.missions.map((mission) => (
          <MissionRow
            key={mission.id}
            mission={mission}
            categoryColor={categoryColor}
            isLoading={loadingMission === mission.id}
            bossMode={bossMode && mission.isBoss}
            canStartBoss={mission.isBoss && nonBossComplete}
            questActive={questStatus === 'active'}
            onComplete={() => onComplete(mission)}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Mission Row ──────────────────────────────────────────────────────────────

function MissionRow({
  mission,
  categoryColor,
  isLoading,
  bossMode,
  canStartBoss,
  questActive,
  onComplete,
}: {
  mission: QuestMission
  categoryColor: string
  isLoading: boolean
  bossMode: boolean
  canStartBoss: boolean
  questActive: boolean
  onComplete: () => void
}) {
  const isCompleted = mission.status === 'completed'
  const isAvailable = mission.status === 'available'
  const isLocked = mission.status === 'locked'

  return (
    <div
      className="flex items-center gap-3 py-2.5 transition-all"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        opacity: isLocked ? 0.35 : 1,
      }}
    >
      {/* Status indicator */}
      <div className="flex-shrink-0">
        {isCompleted ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: `${categoryColor}20` }}
          >
            <span className="text-[10px]" style={{ color: categoryColor }}>✓</span>
          </div>
        ) : isLocked ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>🔒</span>
          </div>
        ) : mission.isBoss ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              background: bossMode
                ? 'rgba(248,113,113,0.2)'
                : 'rgba(251,191,36,0.15)',
              animation: bossMode ? 'pulse 1.5s ease-in-out infinite' : 'none',
            }}
          >
            <span className="text-[10px]">⚔️</span>
          </div>
        ) : (
          <div
            className="w-5 h-5 rounded-full"
            style={{ border: `1.5px solid ${categoryColor}40` }}
          />
        )}
      </div>

      {/* Mission info */}
      <div className="flex-1 min-w-0">
        <p
          className="text-xs"
          style={{
            color: isCompleted
              ? 'rgba(255,255,255,0.4)'
              : 'rgba(255,255,255,0.8)',
            textDecoration: isCompleted ? 'line-through' : 'none',
          }}
        >
          {mission.isBoss && '⚔ '}
          {mission.title}
        </p>
        {mission.description && isAvailable && (
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {mission.description}
          </p>
        )}
      </div>

      {/* XP + Action */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[10px]" style={{ color: 'rgba(255,200,50,0.5)' }}>
          +{mission.xpReward}
        </span>
        {isAvailable && questActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onComplete() }}
            disabled={isLoading || (mission.isBoss && !canStartBoss)}
            className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all hover:scale-105 disabled:opacity-30"
            style={{
              background: mission.isBoss
                ? 'linear-gradient(135deg, rgba(248,113,113,0.2), rgba(239,68,68,0.1))'
                : `${categoryColor}15`,
              color: mission.isBoss ? '#F87171' : categoryColor,
              border: mission.isBoss
                ? '1px solid rgba(248,113,113,0.2)'
                : `1px solid ${categoryColor}20`,
              cursor: isLoading ? 'wait' : 'pointer',
            }}
          >
            {isLoading ? '...' : mission.isBoss ? 'Battle' : 'Done'}
          </button>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.8; }
        }
      `}</style>
    </div>
  )
}
