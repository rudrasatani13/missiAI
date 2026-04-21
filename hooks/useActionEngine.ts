"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import type { ActionResult } from "@/types/actions"

export function useActionEngine() {
  const [lastResult, setLastResult] = useState<ActionResult | null>(null)
  const [isExecuting, setIsExecuting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
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
    [],
  )

  const clearResult = useCallback(() => {
    setLastResult(null)
  }, [])

  return {
    lastResult,
    isExecuting,
    error,
    detectAndExecute,
    clearResult,
  }
}
