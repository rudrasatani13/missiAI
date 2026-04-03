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

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Razorpay SDK'))
    document.head.appendChild(script)
  })
}

export function useBilling() {
  const [plan, setPlan] = useState<PlanConfig | null>(null)
  const [usage, setUsage] = useState<DailyUsage | null>(null)
  const [billing, setBilling] = useState<UserBilling | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpgrading, setIsUpgrading] = useState(false)

  const refreshBilling = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/billing')
      if (!res.ok) return
      const data = await res.json()
      setPlan(data.plan ?? null)

      if (data.usage) {
        const localCount = getLocalCount()
        const serverCount = data.usage.voiceInteractions ?? 0
        const merged = { ...data.usage, voiceInteractions: Math.max(serverCount, localCount) }
        if (localCount < merged.voiceInteractions) setLocalCount(merged.voiceInteractions)
        setUsage(merged)
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
        if (data.usage) {
          const localCount = getLocalCount()
          const serverCount = data.usage.voiceInteractions ?? 0
          const merged = { ...data.usage, voiceInteractions: Math.max(serverCount, localCount) }
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

  const initiateRazorpayCheckout = useCallback(async (planId: 'pro' | 'business') => {
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

      const { subscriptionId, keyId } = data

      await loadRazorpayScript()

      const rzp = new (window as any).Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: 'missiAI',
        description: planId === 'pro' ? 'Pro Plan' : 'Business Plan',
        image: '/missi-ai-logo.png',
        handler: async (response: {
          razorpay_payment_id: string
          razorpay_subscription_id: string
          razorpay_signature: string
        }) => {
          try {
            const verifyRes = await fetch('/api/v1/billing/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_subscription_id: response.razorpay_subscription_id,
                razorpay_signature: response.razorpay_signature,
                planId,
              }),
            })
            const verifyData = await verifyRes.json()
            if (verifyData.success) {
              await refreshBilling()
            } else {
              setError('Payment verification failed. Contact support.')
            }
          } catch {
            setError('Payment verification failed. Contact support.')
          } finally {
            setIsUpgrading(false)
          }
        },
        prefill: {},
        theme: { color: '#7C3AED' },
        modal: {
          ondismiss: () => { setIsUpgrading(false) },
        },
      })
      rzp.open()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed')
      setIsUpgrading(false)
    }
  }, [refreshBilling])

  const cancelSubscription = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/v1/billing', { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to cancel subscription')
      }
      await refreshBilling()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed')
    }
  }, [refreshBilling])

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
    initiateRazorpayCheckout,
    cancelSubscription,
    isAtLimit,
    remainingInteractions,
    incrementUsageLocally,
  }
}
