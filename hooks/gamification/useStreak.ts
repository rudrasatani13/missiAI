'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GamificationData, CheckInResult } from '@/types/gamification'

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
        return null
      }
    },
    [],
  )

  return { data, isLoading, lastResult, checkIn }
}
