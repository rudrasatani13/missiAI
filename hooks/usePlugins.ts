"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { PluginConfig, PluginId, PluginResult } from "@/types/plugins"

type SafePlugin = Omit<PluginConfig, "credentials">

export function usePlugins() {
  const [plugins, setPlugins] = useState<SafePlugin[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastResult, setLastResult] = useState<PluginResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchPlugins = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/plugins")
      if (!res.ok) return
      const data = await res.json()
      if (data.success && mountedRef.current) {
        setPlugins(data.data?.plugins ?? [])
      }
    } catch {
      // Silently ignore network failures
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => {
    fetchPlugins()
  }, [fetchPlugins])

  const connectPlugin = useCallback(
    async (
      id: PluginId,
      credentials: Record<string, string>,
      settings?: Record<string, string>,
    ): Promise<boolean> => {
      try {
        const res = await fetch("/api/v1/plugins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, credentials, settings }),
        })
        const data = await res.json()
        if (!data.success) {
          if (mountedRef.current) setError(data.error ?? "Failed to connect plugin")
          return false
        }
        await fetchPlugins()
        return true
      } catch {
        if (mountedRef.current) setError("Failed to connect plugin")
        return false
      }
    },
    [fetchPlugins],
  )

  const disconnectPlugin = useCallback(
    async (id: PluginId): Promise<void> => {
      // Optimistic update: remove from local state immediately
      if (mountedRef.current) {
        setPlugins((prev) => prev.filter((p) => p.id !== id))
      }
      try {
        await fetch("/api/v1/plugins", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        })
      } catch {
        // Ignore failures; state was already updated optimistically
      }
      await fetchPlugins()
    },
    [fetchPlugins],
  )

  const executeVoiceCommand = useCallback(
    async (pluginId: PluginId, userMessage: string): Promise<PluginResult | null> => {
      try {
        const res = await fetch("/api/v1/plugins", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pluginId, userMessage }),
        })
        const data = await res.json()
        if (!data.success) {
          if (mountedRef.current) setError(data.error ?? "Plugin execution failed")
          return null
        }
        const result: PluginResult = data.data?.result
        if (result && mountedRef.current) {
          setLastResult(result)
        }
        return result ?? null
      } catch {
        if (mountedRef.current) setError("Plugin execution failed")
        return null
      }
    },
    [],
  )

  const isConnected = useCallback(
    (id: PluginId): boolean => {
      return plugins.some((p) => p.id === id && p.status === "connected")
    },
    [plugins],
  )

  const clearResult = useCallback(() => {
    setLastResult(null)
  }, [])

  return {
    plugins,
    isLoading,
    lastResult,
    error,
    connectPlugin,
    disconnectPlugin,
    executeVoiceCommand,
    isConnected,
    clearResult,
  }
}
