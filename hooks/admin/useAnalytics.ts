'use client'

import { useState, useEffect, useCallback } from 'react'
import type { AnalyticsSnapshot } from '@/types/analytics'

interface UseAnalyticsReturn {
  snapshot: AnalyticsSnapshot | null
  planBreakdown: Record<string, number> | null
  isLoading: boolean
  error: string | null
  isForbidden: boolean
  refresh: () => Promise<void>
  formatNumber: (n: number) => string
}

export function useAnalytics(): UseAnalyticsReturn {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null)
  const [planBreakdown, setPlanBreakdown] = useState<Record<string, number> | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isForbidden, setIsForbidden] = useState(false)

  const fetchAnalytics = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/v1/admin/analytics')

      if (res.status === 403) {
        setIsForbidden(true)
        setIsLoading(false)
        return
      }

      if (res.status === 401) {
        setError('Unauthorized')
        setIsLoading(false)
        return
      }

      if (!res.ok) {
        setError('Failed to fetch analytics')
        setIsLoading(false)
        return
      }

      const json = await res.json()
      if (json.success && json.data) {
        setSnapshot({
          today: json.data.today,
          yesterday: json.data.yesterday,
          last7Days: json.data.last7Days,
          lifetime: json.data.lifetime,
          generatedAt: json.data.generatedAt,
        })
        setPlanBreakdown(json.data.planBreakdown ?? null)
      }
    } catch {
      setError('Network error')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const formatNumber = useCallback((n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }, [])

  return {
    snapshot,
    planBreakdown,
    isLoading,
    error,
    isForbidden,
    refresh: fetchAnalytics,
    formatNumber,
  }
}
