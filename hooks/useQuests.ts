'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Quest, QuestStats } from '@/types/quests'

export function useQuests() {
  const [quests, setQuests] = useState<Quest[]>([])
  const [activeCount, setActiveCount] = useState(0)
  const [stats, setStats] = useState<QuestStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchQuests = useCallback(async (status?: string) => {
    try {
      setIsLoading(true)
      const url = status
        ? `/api/v1/quests?status=${status}`
        : '/api/v1/quests'
      const res = await fetch(url)
      const json = await res.json()
      if (json?.success) {
        setQuests(json.quests ?? [])
        setActiveCount(json.activeCount ?? 0)
      }
    } catch {
      setError('Failed to load quests')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/quests/stats')
      const json = await res.json()
      if (json?.success) {
        setStats(json.stats)
      }
    } catch {
      // Non-critical
    }
  }, [])

  const createQuest = useCallback(async (data: {
    userGoal: string
    category: string
    difficulty: string
    targetDurationDays: number
  }): Promise<Quest | null> => {
    try {
      const res = await fetch('/api/v1/quests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (json?.success && json.quest) {
        setQuests(prev => [json.quest, ...prev])
        return json.quest
      }
      setError(json?.error ?? 'Failed to create quest')
      return null
    } catch {
      setError('Failed to create quest')
      return null
    }
  }, [])

  const updateQuestStatus = useCallback(async (
    questId: string,
    action: 'start' | 'abandon' | 'resume',
  ): Promise<Quest | null> => {
    try {
      const res = await fetch(`/api/v1/quests/${questId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const json = await res.json()
      if (json?.success && json.quest) {
        setQuests(prev =>
          prev.map(q => q.id === questId ? json.quest : q),
        )
        return json.quest
      }
      setError(json?.error ?? `Failed to ${action} quest`)
      return null
    } catch {
      setError(`Failed to ${action} quest`)
      return null
    }
  }, [])

  const completeMission = useCallback(async (
    questId: string,
    missionId: string,
    bossToken?: string,
  ) => {
    try {
      const body: Record<string, string> = {}
      if (bossToken) body.bossToken = bossToken

      const res = await fetch(
        `/api/v1/quests/${questId}/missions/${missionId}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const json = await res.json()
      if (json?.success) {
        // Update local quest with server response
        if (json.quest) {
          setQuests(prev =>
            prev.map(q => q.id === questId ? json.quest : q),
          )
        }
        return json
      }
      setError(json?.error ?? 'Failed to complete mission')
      return null
    } catch {
      setError('Failed to complete mission')
      return null
    }
  }, [])

  const getBossToken = useCallback(async (questId: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/v1/quests/${questId}/boss-token`)
      const json = await res.json()
      return json?.success ? json.bossToken : null
    } catch {
      return null
    }
  }, [])

  const deleteQuest = useCallback(async (questId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/v1/quests/${questId}`, { method: 'DELETE' })
      const json = await res.json()
      if (json?.success) {
        setQuests(prev => prev.filter(q => q.id !== questId))
        return true
      }
      return false
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    fetchQuests()
    fetchStats()
  }, [fetchQuests, fetchStats])

  return {
    quests,
    activeCount,
    stats,
    isLoading,
    error,
    setError,
    fetchQuests,
    fetchStats,
    createQuest,
    updateQuestStatus,
    completeMission,
    getBossToken,
    deleteQuest,
  }
}
