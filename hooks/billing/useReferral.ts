'use client'

import { useState, useEffect, useCallback } from 'react'

interface ReferralInfo {
  code: string
  totalReferred: number
  successfulReferred: number
  rewardDaysEarned: number
  maxReferrals: number
  remainingSlots: number
}

export function useReferral() {
  const [referral, setReferral] = useState<ReferralInfo | null>(null)
  const [isReferred, setIsReferred] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState(false)

  // Check for ?ref= param in URL and store it
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (refCode) {
      localStorage.setItem('missi-referral-code', refCode)
      // Clean URL without reload
      const url = new URL(window.location.href)
      url.searchParams.delete('ref')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])

  // Fetch referral info
  useEffect(() => {
    let cancelled = false

    async function fetch_referral() {
      try {
        const res = await fetch('/api/v1/referral')
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        if (data.success) {
          setReferral(data.referral)
          setIsReferred(data.isReferred)
        }
      } catch {
        // Silent fail
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetch_referral()

    return () => { cancelled = true }
  }, [])

  // Track referral when logged in user has a stored referral code
  useEffect(() => {
    const storedCode = localStorage.getItem('missi-referral-code')
    if (!storedCode || isLoading) return

    async function trackRef() {
      try {
        const res = await fetch('/api/v1/referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referralCode: storedCode }),
        })
        const data = await res.json()
        if (data.success) {
          // Clear stored code after successful tracking
          localStorage.removeItem('missi-referral-code')
          setIsReferred(true)
        }
      } catch {
        // Will retry next time
      }
    }

    trackRef()
  }, [isLoading])

  const getReferralLink = useCallback(() => {
    if (!referral) return ''
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://missi.space'
    return `${baseUrl}/?ref=${referral.code}`
  }, [referral])

  const copyReferralLink = useCallback(async () => {
    const link = getReferralLink()
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const el = document.createElement('textarea')
      el.value = link
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [getReferralLink])

  // Check if pending referral discount should be shown
  const hasReferralDiscount = useCallback(() => {
    if (typeof window === 'undefined') return false
    const storedCode = localStorage.getItem('missi-referral-code')
    return isReferred || !!storedCode
  }, [isReferred])

  return {
    referral,
    isReferred,
    isLoading,
    copied,
    getReferralLink,
    copyReferralLink,
    hasReferralDiscount,
  }
}
