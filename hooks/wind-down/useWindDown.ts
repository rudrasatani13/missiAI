'use client'

import { useState, useEffect, useCallback } from 'react'
import type { EveningReflection } from '@/types/proactive'

export function useWindDown() {
  const [reflection, setReflection] = useState<EveningReflection | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    fetch('/api/v1/wind-down')
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data) {
          setReflection(res.data as EveningReflection)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  const markDelivered = useCallback(() => {
    fetch('/api/v1/wind-down', { method: 'POST' }).catch(() => {})
    setReflection((prev) =>
      prev ? { ...prev, deliveredAt: Date.now() } : prev,
    )
  }, [])

  return { reflection, isLoading, markDelivered }
}
