'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GamificationData, CheckInResult } from '@/types/gamification'
import { useBuddyState } from '@/hooks/buddy/useBuddyState'

export function useStreak() {
  const [data, setData] = useState<GamificationData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastResult, setLastResult] = useState<CheckInResult | null>(null)

  useEffect(() => {
    setIsLoading(true)
    fetch('/api/v1/streak')
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data) {
          setData(res.data as GamificationData)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const checkIn = useCallback(
    async (nodeId: string, habitTitle: string): Promise<CheckInResult | null> => {
      try {
        const res = await fetch('/api/v1/streak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId, habitTitle }),
        })
        const json = await res.json()
        if (!json?.success || !json.data) return null

        const result = json.data as CheckInResult
        const buddy = useBuddyState.getState()

        if (result.alreadyCheckedIn) {
          buddy.setState('idle', `${habitTitle} is already checked in today.`)
          return result
        }

        if (result.milestone || result.newAchievements.length > 0) {
          buddy.triggerPet(0.92, 1500)
          buddy.celebrate(
            result.celebrationText ?? `${habitTitle} hit a ${result.habit.currentStreak}-day streak!`,
            4500,
          )
        } else {
          buddy.triggerPet(0.7, 950)
          buddy.celebrate(`${habitTitle} logged. ${result.habit.currentStreak}-day streak!`, 3200)
        }
        
        setLastResult(result)
        setData((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            totalXP: result.totalXP,
            level: result.level,
            habits: prev.habits.map((h) =>
              h.nodeId === result.habit.nodeId ? result.habit : h,
            ),
          }
        })
        return result
      } catch {
        useBuddyState.getState().sayError(`Couldn't log ${habitTitle}.`, 3200)
        return null
      }
    },
    [],
  )

  return { data, isLoading, lastResult, checkIn }
}
