"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type { ActionIntent, ActionResult } from "@/types/actions"

interface SavedItems {
  reminders: unknown[]
  notes: unknown[]
}

export function useActionEngine() {
  const [pendingAction, setPendingAction] = useState<ActionIntent | null>(null)
  const [lastResult, setLastResult] = useState<ActionResult | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedItems, setSavedItems] = useState<SavedItems>({ reminders: [], notes: [] })
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Fetch saved items on mount
  useEffect(() => {
    fetch("/api/v1/actions")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data && mountedRef.current) {
          setSavedItems({
            reminders: d.data.reminders ?? [],
            notes: d.data.notes ?? [],
          })
        }
      })
      .catch(() => {})
  }, [])

  const refreshSavedItems = useCallback(() => {
    fetch("/api/v1/actions")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data && mountedRef.current) {
          setSavedItems({
            reminders: d.data.reminders ?? [],
            notes: d.data.notes ?? [],
          })
        }
      })
      .catch(() => {})
  }, [])

  const detectAndExecute = useCallback(
    async (
      userMessage: string,
      conversationContext: string,
    ): Promise<ActionResult | null> => {
      if (!userMessage.trim()) return null

      setIsExecuting(true)
      setError(null)

      try {
        const res = await fetch("/api/v1/actions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessage, conversationContext }),
        })

        if (!res.ok) {
          console.warn("[ActionEngine] API returned", res.status)
          return null
        }

        const data = await res.json()

        if (!data.success) {
          console.warn("[ActionEngine] API error:", data.error)
          return null
        }

        if (data.data?.actionable === false) {
          return null
        }

        const result = data.data?.result as ActionResult | undefined
        if (result && mountedRef.current) {
          setLastResult(result)
          setPendingAction(data.data?.intent ?? null)

          // Refresh saved items after reminder or note
          if (result.type === "set_reminder" || result.type === "take_note") {
            refreshSavedItems()
          }
        }

        return result ?? null
      } catch (err) {
        console.warn("[ActionEngine] fetch error:", err)
        return null
      } finally {
        if (mountedRef.current) {
          setIsExecuting(false)
        }
      }
    },
    [refreshSavedItems],
  )

  const clearResult = useCallback(() => {
    setLastResult(null)
    setPendingAction(null)
  }, [])

  return {
    pendingAction,
    lastResult,
    isExecuting,
    error,
    detectAndExecute,
    clearResult,
    savedItems,
  }
}
