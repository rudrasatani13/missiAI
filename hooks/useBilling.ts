'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import type { PlanConfig, DailyUsage, UserBilling } from '@/types/billing'

// localStorage key for today's usage — resets automatically each new day
function todayStorageKey(): string {
  return `missi-usage-${new Date().toISOString().split('T')[0]}`
}

function getLocalCount(): number {
  try { return parseInt(localStorage.getItem(todayStorageKey()) ?? '0', 10) || 0 } catch { return 0 }
}

function setLocalCount(count: number): void {
  try { localStorage.setItem(todayStorageKey(), String(count)) } catch {}
}

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
          if (res.status === 401) {
            // Not logged in — still load local count so limit is enforced
            const localCount = getLocalCount()
            if (localCount > 0) {
              setUsage({ userId: '', date: todayStorageKey().replace('missi-usage-', ''), voiceInteractions: localCount, lastUpdatedAt: Date.now() })
            }
            return
          }
          throw new Error('Failed to fetch billing')
        }
        const data = await res.json()
        if (cancelled) return
        setPlan(data.plan ?? null)

        // Merge server count with localStorage — take the HIGHER value.
        // If KV write failed silently, localStorage still has the correct count.
        if (data.usage) {
          const localCount = getLocalCount()
          const serverCount = data.usage.voiceInteractions ?? 0
          const merged = { ...data.usage, voiceInteractions: Math.max(serverCount, localCount) }
          // Keep localStorage in sync with the merged value
          if (localCount < merged.voiceInteractions) setLocalCount(merged.voiceInteractions)
          setUsage(merged)
        } else {
          setUsage(null)
        }

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
  // Also persists to localStorage so count survives page navigation
  const incrementUsageLocally = useCallback(() => {
    setUsage((prev) => {
      if (!prev) return prev
      const newCount = prev.voiceInteractions + 1
      setLocalCount(newCount)
      return { ...prev, voiceInteractions: newCount }
    })
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
