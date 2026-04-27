'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DailyBriefing, BriefingItem, ProactiveConfig } from '@/types/proactive'

const isFullDevBootstrap = process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_ENABLE_CF_DEV === '1'

export function useProactive() {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null)
  const [nudges, setNudges] = useState<BriefingItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [config, setConfig] = useState<ProactiveConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const load = () => {
      if (cancelled) return

      setIsLoading(true)

      let lastInteractionAt: number
      try {
        const stored = localStorage.getItem('missi-last-interaction-at')
        lastInteractionAt = stored ? parseInt(stored, 10) : Date.now() - 24 * 60 * 60 * 1000
      } catch {
        lastInteractionAt = Date.now() - 24 * 60 * 60 * 1000
      }

      Promise.all([
        fetch('/api/v1/proactive').then((r) => r.json()),
        fetch('/api/v1/proactive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastInteractionAt }),
        }).then((r) => r.json()),
      ])
        .then(([briefingRes, nudgesRes]) => {
          if (cancelled) return
          if (briefingRes?.success && briefingRes.data) {
            setBriefing(briefingRes.data as DailyBriefing)
          }
          if (nudgesRes?.success && nudgesRes.data?.nudges) {
            setNudges(nudgesRes.data.nudges as BriefingItem[])
          }
        })
        .catch((error) => {
          console.error('[Proactive] Failed to load briefing and nudges', error)
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }

    if (isFullDevBootstrap) {
      load()
    } else {
      timer = setTimeout(load, 4000)
    }

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  /**
   * Optimistically dismiss a briefing item and persist via API.
   */
  const dismissItem = useCallback((item: BriefingItem) => {
    const now = Date.now()

    // Optimistic local update
    setBriefing((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        items: prev.items.map((i) =>
          i.type === item.type && i.nodeId === item.nodeId
            ? { ...i, dismissedAt: now }
            : i,
        ),
      }
    })
    setNudges((prev) =>
      prev.filter((n) => !(n.type === item.type && n.nodeId === item.nodeId)),
    )

    // Persist
    fetch('/api/v1/proactive', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId: item.nodeId, type: item.type }),
    }).catch((error) => {
      console.error('[Proactive] Failed to persist dismissed item', error)
    })
  }, [])

  /**
   * Update proactive config — persists via API and updates local state.
   */
  const updateConfig = useCallback(async (newConfig: ProactiveConfig) => {
    await fetch('/api/v1/proactive', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newConfig),
    })
    setConfig(newConfig)
  }, [])

  /**
   * Mark the briefing as delivered (updates local state only — no server round-trip).
   */
  const markDelivered = useCallback(() => {
    setBriefing((prev) => {
      if (!prev || prev.deliveredAt) return prev
      return { ...prev, deliveredAt: Date.now() }
    })
  }, [])

  return { briefing, nudges, isLoading, config, dismissItem, updateConfig, markDelivered }
}
