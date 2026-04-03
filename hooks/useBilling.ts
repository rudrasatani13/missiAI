'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useUser } from '@clerk/nextjs'
import type { PlanConfig, DailyUsage, UserBilling } from '@/types/billing'

// SEC-4 FIX: localStorage is used ONLY for optimistic UI, server is the source of truth.
// We no longer merge with Math.max — server count always wins.
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
    // CLI-1 FIX: Provide specific error message for SDK load failure
    script.onerror = () => reject(new Error('Failed to load payment gateway. Please check your internet connection or disable ad blocker and try again.'))
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
  // CLI-2 FIX: Add isCancelling loading state
  const [isCancelling, setIsCancelling] = useState(false)
  // CLI-5 FIX: Track mounted state to prevent state updates after unmount
  const mountedRef = useRef(true)

  // CLI-6 FIX: Get user info for Razorpay prefill
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
        // SEC-4 FIX: Server count is source of truth — use it directly
        const serverCount = data.usage.voiceInteractions ?? 0
        setLocalCount(serverCount) // Sync local for optimistic UI only
        setUsage(data.usage)
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

        // SEC-4 FIX: Server is source of truth — no Math.max merge with localStorage
        if (data.usage) {
          const serverCount = data.usage.voiceInteractions ?? 0
          setLocalCount(serverCount)
          setUsage(data.usage)
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

    let createdSubscriptionId: string | null = null

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
      createdSubscriptionId = subscriptionId

      // CLI-1 FIX: loadRazorpayScript now provides specific error messages
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
            // CLI-5 FIX: Check mounted before updating state
            if (!mountedRef.current) return
            if (verifyData.success) {
              await refreshBilling()
            } else {
              setError('Payment verification failed. Contact support.')
            }
          } catch {
            if (mountedRef.current) {
              setError('Payment verification failed. Contact support.')
            }
          } finally {
            if (mountedRef.current) {
              setIsUpgrading(false)
            }
          }
        },
        // CLI-6 FIX: Prefill user data from Clerk for better UX
        prefill: {
          name: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : '',
          email: user?.emailAddresses?.[0]?.emailAddress ?? '',
        },
        theme: { color: '#7C3AED' },
        modal: {
          // CLI-4 FIX: On dismiss, cancel the orphaned subscription on the backend
          ondismiss: async () => {
            if (mountedRef.current) {
              setIsUpgrading(false)
            }
            // Clean up the subscription that was created but never paid
            if (createdSubscriptionId) {
              try {
                await fetch('/api/v1/billing', { method: 'DELETE' })
              } catch {
                // Best-effort cleanup — webhook will eventually handle it
              }
            }
          },
        },
      })
      rzp.open()
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Checkout failed')
        setIsUpgrading(false)
      }
    }
  }, [refreshBilling, user])

  // CLI-2 FIX: cancelSubscription now has loading state
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
    isCancelling,
    initiateRazorpayCheckout,
    cancelSubscription,
    isAtLimit,
    remainingInteractions,
    incrementUsageLocally,
  }
}
