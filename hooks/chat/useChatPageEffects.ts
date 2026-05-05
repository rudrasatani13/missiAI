"use client"

import { useEffect, useRef, type MutableRefObject } from "react"
import { detectPluginCommand } from "@/lib/plugins/plugin-registry"
import {
  getConnectedPluginIds,
  getGreetingMessage,
  shouldHandleChatHotkey,
  shouldTrackLastInteraction,
} from "@/lib/chat/page-effects"
import type { VoiceState } from "@/types/chat"
import type { PluginConfig, PluginId } from "@/types/plugins"

interface UseChatPageEffectsOptions {
  billingLoading: boolean
  bootCompleted: boolean
  cancelAll: () => void
  displayName: string
  effectiveVoiceState: VoiceState
  executeVoiceCommand: (pluginId: PluginId, userMessage: string) => Promise<unknown>
  getLastRecordingDurationMs: () => number
  greet: (text: string) => Promise<unknown>
  greetedRef: MutableRefObject<boolean>
  handleTap: () => void
  incrementUsageLocally: (durationMs: number) => void
  isAtLimit: boolean
  isLoaded: boolean
  lastResponse: string
  lastTranscript: string
  liveMode: boolean
  plugins: Array<Pick<PluginConfig, "id" | "status">>
  saveMemoryBeacon: () => void
  showBootSequence: boolean
  voiceEnabled: boolean
  voiceState: VoiceState
}

export function useChatPageEffects(options: UseChatPageEffectsOptions) {
  const {
    billingLoading,
    bootCompleted,
    cancelAll,
    displayName,
    effectiveVoiceState,
    executeVoiceCommand,
    getLastRecordingDurationMs,
    greet,
    greetedRef,
    handleTap,
    incrementUsageLocally,
    isAtLimit,
    isLoaded,
    lastResponse,
    lastTranscript,
    liveMode,
    plugins,
    saveMemoryBeacon,
    showBootSequence,
    voiceEnabled,
    voiceState,
  } = options
  const lastResponseForPluginRef = useRef("")
  const effectiveVoiceStateRef = useRef<VoiceState>(effectiveVoiceState)

  useEffect(() => {
    effectiveVoiceStateRef.current = effectiveVoiceState
  }, [effectiveVoiceState])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldHandleChatHotkey(event)) {
        event.preventDefault()
        if (!isAtLimit && !billingLoading) {
          handleTap()
        }
      }
      if (event.code === "Escape") {
        cancelAll()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [handleTap, cancelAll, isAtLimit, billingLoading])

  useEffect(() => () => { cancelAll() }, [cancelAll])

  useEffect(() => {
    const handleBeforeUnload = () => saveMemoryBeacon()
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveMemoryBeacon()
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [saveMemoryBeacon])

  useEffect(() => {
    if (liveMode) return
    if (!isLoaded || greetedRef.current || isAtLimit || billingLoading) return
    if (showBootSequence && !bootCompleted) return

    greetedRef.current = true
    try {
      sessionStorage.setItem("missi-greeted", "1")
    } catch {}

    let isNewUser = false
    try {
      isNewUser = new URLSearchParams(window.location.search).get("new") === "true"
      if (isNewUser) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    } catch {}

    const greeting = getGreetingMessage(displayName, isNewUser)
    const timer = setTimeout(() => {
      void greet(greeting.message)
    }, greeting.delayMs)

    return () => clearTimeout(timer)
  }, [isLoaded, greet, isAtLimit, billingLoading, showBootSequence, bootCompleted, liveMode, displayName, greetedRef])

  useEffect(() => {
    if (shouldTrackLastInteraction(voiceState)) {
      try {
        localStorage.setItem("missi-last-interaction-at", String(Date.now()))
      } catch {}
    }
  }, [voiceState])

  useEffect(() => {
    if (!lastResponse || lastResponse === lastResponseForPluginRef.current) return
    lastResponseForPluginRef.current = lastResponse

    incrementUsageLocally(getLastRecordingDurationMs())

    if (!lastTranscript) return

    const connectedIds = getConnectedPluginIds(plugins)
    if (connectedIds.length === 0) return

    const matchedPlugin = detectPluginCommand(lastTranscript, connectedIds)
    if (matchedPlugin) {
      void executeVoiceCommand(matchedPlugin, lastTranscript).catch((error) => {
        console.error("[ChatPageEffects] Unexpected plugin voice command failure", error)
      })
    }
  }, [
    lastResponse,
    lastTranscript,
    plugins,
    executeVoiceCommand,
    incrementUsageLocally,
    getLastRecordingDurationMs,
    lastResponseForPluginRef,
  ])
}
