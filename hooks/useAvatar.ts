'use client'

import { useState, useEffect, useCallback } from 'react'
import type { GamificationData, AvatarTier, Achievement, XPLogEntry } from '@/types/gamification'
import { getAvatarTierInfo } from '@/types/gamification'

export interface AvatarState {
  tier: AvatarTier
  tierName: string
  level: number
  totalXP: number
  /** 0-100 progress to next tier */
  tierProgress: number
  nextTierName: string | null
  nextTierXP: number | null
  achievements: Achievement[]
  xpToday: XPLogEntry[]
  xpTodayTotal: number
  loginStreak: number
  habits: GamificationData['habits']
  isLoading: boolean
  refetch: () => void
}

export function useAvatar(): AvatarState {
  const [data, setData] = useState<GamificationData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchData = useCallback(() => {
    setIsLoading(true)
    fetch('/api/v1/streak')
      .then(r => r.json())
      .then(res => {
        if (res?.success && res.data) {
          setData(res.data as GamificationData)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const tier: AvatarTier = data?.avatarTier ?? 1
  const totalXP = data?.totalXP ?? 0

  // Compute tier info
  const tierInfo = getAvatarTierInfo(tier)
  const nextTierInfo = tier < 6 ? getAvatarTierInfo((tier + 1) as AvatarTier) : undefined

  let tierProgress = 100
  if (nextTierInfo) {
    const range = nextTierInfo.xpRequired - tierInfo.xpRequired
    const current = totalXP - tierInfo.xpRequired
    tierProgress = Math.min(100, Math.max(0, Math.round((current / range) * 100)))
  }

  const xpToday = data?.xpLog ?? []
  const xpTodayTotal = xpToday.reduce((sum, e) => sum + e.amount, 0)

  return {
    tier,
    tierName: tierInfo?.name ?? 'Spark',
    level: data?.level ?? 1,
    totalXP,
    tierProgress,
    nextTierName: nextTierInfo?.name ?? null,
    nextTierXP: nextTierInfo?.xpRequired ?? null,
    achievements: data?.achievements ?? [],
    xpToday,
    xpTodayTotal,
    loginStreak: data?.loginStreak ?? 0,
    habits: data?.habits ?? [],
    isLoading,
    refetch: fetchData,
  }
}
