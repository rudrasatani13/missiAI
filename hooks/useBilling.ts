'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import type { PlanConfig, DailyUsage, UserBilling } from '@/types/billing'

// localStorage is used ONLY for optimistic UI, server is the source of truth.
// When server returns 0, we use Math.max to prevent false resets
// (KV cold starts / edge-function restarts can return 0 temporarily).
function todayStorageKey(): string {
  return `missi-voice-secs-${new Date().toISOString().split('T')[0]}`
}

function getLocalSeconds(): number {
  try {
    const key = todayStorageKey()
    const val = localStorage.getItem(key)
    if (!val) return 0
    return parseInt(val, 10) || 0
  } catch { return 0 }
}

function setLocalSeconds(seconds: number): void {
  try {
    const todayKey = todayStorageKey()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k && k.startsWith('missi-voice-secs-') && k !== todayKey) {
        localStorage.removeItem(k)
      }
    }
    localStorage.setItem(todayKey, String(seconds))
  } catch {}
}

/**
 * Reconcile server seconds with local seconds.
 * - If server returns non-zero, server wins (it's authoritative).
 * - If server returns 0, use Math.max to prevent false reset from KV miss.
 */
function reconcileSeconds(serverSecs: number, localSecs: number): number {
  if (serverSecs > 0) return serverSecs
  return Math.max(serverSecs, localSecs)
}

export function useBilling() {
  const [plan, setPlan] = useState<PlanConfig | null>(null)
  const [usage, setUsage] = useState<DailyUsage | null>(null)
  const [billing, setBilling] = useState<UserBilling | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpgrading, setIsUpgrading] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  // Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true)

  const { user } = useUser()

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refreshBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/billing')
      if (!res.ok) return
      const data = await res.json()
      if (!mountedRef.current) return
      setPlan(data.plan ?? null)

      if (data.usage) {
        const serverSecs = data.usage.voiceSecondsUsed ?? 0
        const finalSecs = reconcileSeconds(serverSecs, getLocalSeconds())
        setLocalSeconds(finalSecs)
        setUsage({ ...data.usage, voiceSecondsUsed: finalSecs })
      } else {
        setUsage(null)
      }

      setBilling(data.billing ?? null)
    } catch {
      // Silent refresh failure
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function fetchBilling() {
      try {
        const res = await fetch('/api/v1/billing')
        if (!res.ok) {
          if (res.status === 401) {
            const localSecs = getLocalSeconds()
            if (localSecs > 0) {
              setUsage({ userId: '', date: todayStorageKey().replace('missi-voice-secs-', ''), voiceInteractions: 0, voiceSecondsUsed: localSecs, lastUpdatedAt: Date.now() })
            }
            return
          }
          throw new Error('Failed to fetch billing')
        }
        const data = await res.json()
        if (cancelled) return
        setPlan(data.plan ?? null)

        if (data.usage) {
          const serverSecs = data.usage.voiceSecondsUsed ?? 0
          const finalSecs = reconcileSeconds(serverSecs, getLocalSeconds())
          setLocalSeconds(finalSecs)
          setUsage({ ...data.usage, voiceSecondsUsed: finalSecs })
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

    // Check for successful checkout redirect
    try {
      const params = new URLSearchParams(window.location.search)
      if (params.get('success') === 'true') {
        // User came back from Dodo checkout — poll for plan activation
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch('/api/v1/billing')
            if (!res.ok) return
            const data = await res.json()
            if (data.plan?.id !== 'free') {
              clearInterval(pollInterval)
              if (!cancelled) {
                setPlan(data.plan)
                setBilling(data.billing ?? null)
              }
            }
          } catch {}
        }, 3000)

        // Stop polling after 60 seconds
        setTimeout(() => clearInterval(pollInterval), 60000)

        // Clean up URL params
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    } catch {}

    return () => { cancelled = true }
  }, [])

  // ─── Dodo Checkout: redirect to hosted checkout page ─────────────────────
  const initiateCheckout = useCallback(async (planId: 'plus' | 'pro') => {
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

      // Redirect to Dodo Payments hosted checkout page
      if (data.checkout_url) {
        window.location.href = data.checkout_url
        return
      }

      throw new Error('No checkout URL received')
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Checkout failed')
        setIsUpgrading(false)
      }
    }
  }, [])

  const cancelSubscription = useCallback(async () => {
    setIsCancelling(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/billing', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to cancel subscription')
      }
      await refreshBilling()
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Cancel failed')
      }
    } finally {
      if (mountedRef.current) {
        setIsCancelling(false)
      }
    }
  }, [refreshBilling])

  const limitSeconds = useMemo(() => {
    if (!plan) return 600 // default 10 min
    return plan.voiceMinutesPerDay * 60
  }, [plan])

  const usedSeconds = useMemo(() => {
    return usage?.voiceSecondsUsed ?? 0
  }, [usage])

  const isAtLimit = useMemo(() => {
    if (!usage || !plan) return false
    if (plan.id === 'pro') return false
    return usedSeconds >= limitSeconds
  }, [usage, plan, usedSeconds, limitSeconds])

  const remainingSeconds = useMemo(() => {
    if (!plan) return 0
    if (plan.id === 'pro') return 999999
    return Math.max(0, limitSeconds - usedSeconds)
  }, [plan, usedSeconds, limitSeconds])

  /**
   * Called after each successful voice interaction to keep UI in sync.
   * @param durationMs — recording duration in ms (server clamps to 3–120s)
   */
  const incrementUsageLocally = useCallback((durationMs?: number) => {
    const addSecs = durationMs ? Math.max(3, Math.min(Math.ceil(durationMs / 1000), 120)) : 3
    setUsage((prev) => {
      if (!prev) return prev
      const newSecs = prev.voiceSecondsUsed + addSecs
      setLocalSeconds(newSecs)
      return { ...prev, voiceSecondsUsed: newSecs, voiceInteractions: prev.voiceInteractions + 1 }
    })
  }, [])

  return {
    plan,
    usage,
    billing,
    isLoading,
    error,
    isUpgrading,
    isCancelling,
    initiateCheckout,
    cancelSubscription,
    refreshBilling,
    isAtLimit,
    usedSeconds,
    limitSeconds,
    remainingSeconds,
    incrementUsageLocally,
  }
}
