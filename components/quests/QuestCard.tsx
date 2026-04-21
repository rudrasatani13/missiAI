'use client'

import Link from 'next/link'
import type { Quest } from '@/types/quests'

interface QuestCardProps {
  quest: Quest
  onSelect: (quest: Quest) => void
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

const STATUS_LABELS: Record<string, { text: string; color: string }> = {
  draft: { text: 'Ready', color: '#94A3B8' },
  active: { text: 'Active', color: '#34D399' },
  completed: { text: 'Complete', color: '#FBBF24' },
  abandoned: { text: 'Paused', color: '#F87171' },
}

export function QuestCard({ quest, onSelect }: QuestCardProps) {
  const progress = quest.totalMissions > 0
    ? Math.round((quest.completedMissions / quest.totalMissions) * 100)
    : 0
  const categoryColor = CATEGORY_COLORS[quest.category] ?? '#94A3B8'
  const status = STATUS_LABELS[quest.status] ?? STATUS_LABELS.draft

  // Find current mission
  let currentMission: string | null = null
  for (const chapter of quest.chapters) {
    for (const mission of chapter.missions) {
      if (mission.status === 'available') {
        currentMission = mission.title
        break
      }
    }
    if (currentMission) break
  }

  // Determine which chapter we're in
  let currentChapter = 1
  for (const chapter of quest.chapters) {
    const hasAvailable = chapter.missions.some(m => m.status === 'available')
    if (hasAvailable) {
      currentChapter = chapter.chapterNumber
      break
    }
  }

  return (
    <button
      onClick={() => onSelect(quest)}
      className="group relative w-full text-left rounded-2xl p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl"
      style={{
        background: 'rgba(20,20,26,0.55)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: `1px solid ${categoryColor}15`,
        cursor: 'pointer',
      }}
    >
      {/* Top row: Emoji + Title + Status */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <span className="text-2xl flex-shrink-0 transition-transform group-hover:scale-110 duration-300">
            {quest.coverEmoji}
          </span>
          <div className="min-w-0 flex-1">
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: 'rgba(255,255,255,0.92)' }}
            >
              {quest.title}
            </h3>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: `${categoryColor}99` }}
            >
              Ch. {currentChapter} of {quest.chapters.length}
            </p>
          </div>
        </div>

        <span
          className="text-[9px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
          style={{
            background: `${status.color}15`,
            color: status.color,
            border: `1px solid ${status.color}20`,
          }}
        >
          {status.text}
        </span>
      </div>

      {/* Progress bar */}
      <div className="mb-2.5">
        <div
          className="w-full h-1.5 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${progress}%`,
              background: `linear-gradient(90deg, ${categoryColor}60, ${categoryColor})`,
              boxShadow: progress > 0 ? `0 0 8px ${categoryColor}40` : 'none',
            }}
          />
        </div>
        <div className="flex justify-between mt-1">
          <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
            {quest.completedMissions} / {quest.totalMissions} missions
          </span>
          <span className="text-[10px] font-medium" style={{ color: categoryColor }}>
            {progress}%
          </span>
        </div>
      </div>

      {/* Next mission preview */}
      {currentMission && quest.status === 'active' && (
        <div
          className="rounded-lg px-3 py-2"
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <p className="text-[9px] mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Next mission
          </p>
          <p
            className="text-[11px] truncate"
            style={{ color: 'rgba(255,255,255,0.65)' }}
          >
            {currentMission}
          </p>
        </div>
      )}

      {/* XP earned */}
      {quest.totalXPEarned > 0 && (
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[10px]" style={{ color: 'rgba(255,200,50,0.7)' }}>
            ✦ {quest.totalXPEarned} XP
          </span>
        </div>
      )}
    </button>
  )
}
