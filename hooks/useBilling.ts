'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { PlanConfig, DailyUsage, UserBilling } from '@/types/billing'

export function useBilling() {
  const [plan, setPlan] = useState<PlanConfig | null>(null)
  const [usage, setUsage] = useState<DailyUsage | null>(null)
  const [billing, setBilling] = useState<UserBilling | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpgrading, setIsUpgrading] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function fetchBilling() {
      try {
        const res = await fetch('/api/v1/billing')
        if (!res.ok) {
          if (res.status === 401) return // Not logged in
          throw new Error('Failed to fetch billing')
        }
        const data = await res.json()
        if (cancelled) return
        setPlan(data.plan ?? null)
        setUsage(data.usage ?? null)
        setBilling(data.billing ?? null)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to fetch billing')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchBilling()
    return () => { cancelled = true }
  }, [])

  const createCheckoutSession = useCallback(async (planId: 'pro' | 'business') => {
    setIsUpgrading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to create checkout')
      }
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
    } finally {
      setIsUpgrading(false)
    }
  }, [])

  const createPortalSession = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/v1/billing', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to open portal')
      }
      if (data.portalUrl) {
        window.location.href = data.portalUrl
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Portal failed')
    }
  }, [])

  const isAtLimit = useMemo(() => {
    if (!usage || !plan) return false
    if (plan.id === 'pro' || plan.id === 'business') return false
    return usage.voiceInteractions >= plan.voiceInteractionsPerDay
  }, [usage, plan])

  const remainingInteractions = useMemo(() => {
    if (!usage || !plan) return 0
    if (plan.id === 'pro' || plan.id === 'business') return 999999
    return Math.max(0, plan.voiceInteractionsPerDay - usage.voiceInteractions)
  }, [usage, plan])

  // Called after each successful voice interaction to keep UI in sync
  // (server already incremented via incrementVoiceUsage — this just updates local state)
  const incrementUsageLocally = useCallback(() => {
    setUsage((prev) =>
      prev ? { ...prev, voiceInteractions: prev.voiceInteractions + 1 } : prev
    )
  }, [])

  return {
    plan,
    usage,
    billing,
    isLoading,
    error,
    isUpgrading,
    createCheckoutSession,
    createPortalSession,
    isAtLimit,
    remainingInteractions,
    incrementUsageLocally,
  }
}
