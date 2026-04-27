"use client"

import { useEffect, useRef, type MutableRefObject } from "react"
import { detectPluginCommand } from "@/lib/plugins/plugin-registry"
import {
  buildRecentConversationContext,
  getConnectedPluginIds,
  getGreetingMessage,
  getHighPriorityBriefingItem,
  shouldHandleChatHotkey,
  shouldTrackLastInteraction,
} from "@/lib/chat/page-effects"
import type { ConversationEntry, VoiceState } from "@/types/chat"
import type { DailyBriefing } from "@/types/proactive"
import type { PluginConfig, PluginId } from "@/types/plugins"

interface UseChatPageEffectsOptions {
  billingLoading: boolean
  bootCompleted: boolean
  briefing: DailyBriefing | null
  cancelAll: () => void
  conversationRef: MutableRefObject<ConversationEntry[]>
  detectAndExecute: (userMessage: string, conversationContext: string) => Promise<unknown>
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
  proactiveSpokenRef: MutableRefObject<boolean>
  saveMemoryBeacon: () => void
  showBootSequence: boolean
  voiceEnabled: boolean
  voiceState: VoiceState
}

export function useChatPageEffects(options: UseChatPageEffectsOptions) {
  const {
    billingLoading,
    bootCompleted,
    briefing,
    cancelAll,
    conversationRef,
    detectAndExecute,
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
    proactiveSpokenRef,
    saveMemoryBeacon,
    showBootSequence,
    voiceEnabled,
    voiceState,
  } = options
  const lastResponseForActionRef = useRef("")
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
    if (liveMode) return
    if (!briefing || proactiveSpokenRef.current || !voiceEnabled || isAtLimit || billingLoading) return

    const highItem = getHighPriorityBriefingItem(briefing.items)
    if (!highItem) return

    const timer = setTimeout(() => {
      if (effectiveVoiceStateRef.current === "idle") {
        proactiveSpokenRef.current = true
        try {
          sessionStorage.setItem("missi-proactive-spoken", "1")
        } catch {}
        void greet(highItem.message)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [briefing, voiceEnabled, greet, isAtLimit, billingLoading, liveMode, proactiveSpokenRef])

  useEffect(() => {
    if (shouldTrackLastInteraction(voiceState)) {
      try {
        localStorage.setItem("missi-last-interaction-at", String(Date.now()))
      } catch {}
    }
  }, [voiceState])

  useEffect(() => {
    if (!lastTranscript || lastTranscript === lastResponseForActionRef.current) return
    lastResponseForActionRef.current = lastTranscript

    const conversationContext = buildRecentConversationContext(conversationRef.current)
    void detectAndExecute(lastTranscript, conversationContext).catch((error) => {
      console.error("[ChatPageEffects] Unexpected action execution failure", error)
    })
  }, [lastTranscript, detectAndExecute, conversationRef, lastResponseForActionRef])

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
