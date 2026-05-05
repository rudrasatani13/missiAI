"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useUser, useClerk } from "@clerk/nextjs"
import { ChatPageShell } from "@/components/chat/ChatPageShell"
import { useChatEntryFlow } from "@/hooks/chat/useChatEntryFlow"
import { useChatHydration } from "@/hooks/chat/useChatHydration"
import { useChatPageEffects } from "@/hooks/chat/useChatPageEffects"
import { useChatSettingsSync } from "@/hooks/chat/useChatSettingsSync"
import { useVoiceStateMachine } from "@/hooks/chat/useVoiceStateMachine"
import { useGeminiLive } from "@/hooks/chat/useGeminiLive"
import { usePlugins } from "@/hooks/chat/usePlugins"
import { useBilling } from "@/hooks/billing/useBilling"
import type { ConversationEntry } from "@/types/chat"
import { shouldShowOnboarding } from "@/components/chat/OnboardingTour"
import { useBuddyState } from "@/hooks/buddy/useBuddyState"

import {
  getEffectiveStatusText,
  getEffectiveTranscriptValue,
  getEffectiveVoiceState,
} from "@/lib/chat/page-helpers"

export default function VoiceAssistantPage() {
  const { user, isLoaded } = useUser()
  const isGuest = isLoaded && !user
  const { signOut } = useClerk()
  const { plan, isAtLimit, usedSeconds, limitSeconds, isLoading: billingLoading, initiateCheckout, incrementUsageLocally } = useBilling()
  const router = useRouter()
  const memoriesRef = useRef("")
  const conversationRef = useRef<ConversationEntry[]>([])
  const lastBuddyErrorRef = useRef<string | null>(null)
  const {
    bootCompleted,
    completeBootSequence,
    dismissOnboarding,
    displayName,
    greetedRef,
    resetGreetingSession,
    showBootSequence,
    showOnboarding,
  } = useChatEntryFlow({
    isLoaded,
    user,
    router,
    shouldOpenOnboarding: shouldShowOnboarding,
  })
  const {
    aiDialsRef,
    analyticsOptOutRef,
    customPrompt,
    customPromptRef,
    incognitoRef,
    personalityRef,
    sharedSettings,
    voiceEnabled,
  } = useChatSettingsSync({
    billingLoading,
    isLoaded,
    planId: plan?.id,
  })
  const {
    memoriesState,
  } = useChatHydration({
    isLoaded,
    memoriesRef,
    userId: user?.id,
  })

  const {
    state: voiceState, audioLevel, statusText, lastTranscript,
    error, setError, streamingText, lastResponse, cancelAll, greet, saveMemoryBeacon,
    currentEmotion, getLastRecordingDurationMs,
  } = useVoiceStateMachine({
    userId: user?.id,
    personalityRef,
    customPromptRef,
    memoriesRef,
    conversationRef,
    aiDialsRef,
    incognitoRef,
    analyticsOptOutRef,
  })

  // ── Real-time Voice Mode ──────────────────────────────────────────────────
  const [liveMode] = useState(true)
  const [liveTranscriptIn, setLiveTranscriptIn] = useState("")
  const [liveTranscriptOut, setLiveTranscriptOut] = useState("")
  const resolveLiveSetup = useCallback(async () => {
    const { buildVoiceSystemPrompt } = await import("@/lib/ai/services/ai-service")

    return {
      systemPrompt: buildVoiceSystemPrompt(
        personalityRef.current,
        memoriesState,
        customPrompt,
        sharedSettings.aiDials,
      ),
      voiceName: "Kore",
    }
  }, [customPrompt, memoriesState, personalityRef, sharedSettings.aiDials])

  const geminiLive = useGeminiLive({
    resolveSetup: resolveLiveSetup,
    onTranscriptIn: (text) => {
      setLiveTranscriptIn(text)
      // Add to conversation for memory
      if (text.trim()) {
        conversationRef.current.push({ role: "user", content: text.trim() })
        if (conversationRef.current.length > 14) {
          conversationRef.current = conversationRef.current.slice(-14)
        }
      }
    },
    onTranscriptOut: (text) => {
      setLiveTranscriptOut(text)
    },
    onStateChange: (s) => {
      // Sync Gemini live state to the Buddy store
      const buddyStore = useBuddyState.getState()
      if (s === "speaking") {
        setLiveTranscriptIn("")
        buddyStore.setState("speaking")
      } else if (s === "connected") {
        // 'connected' means it is listening / idling
        buddyStore.setState("listening")
      } else if (s === "disconnected" || s === "error") {
        buddyStore.setState(s === "error" ? "error" : "idle")
      } else if (s === "connecting") {
        buddyStore.setState("thinking")
      }

      // Model finished a turn → save transcript to memory, then fade out after delay
      if (s === "connected" && liveTranscriptOut.trim()) {
        conversationRef.current.push({ role: "assistant", content: liveTranscriptOut.trim() })
        if (conversationRef.current.length > 14) {
          conversationRef.current = conversationRef.current.slice(-14)
        }
        // Keep the output text visible for 2s so user can read, then clear
        setTimeout(() => setLiveTranscriptOut(""), 2000)
      }
    },
    onAudioLevel: (level) => {
      // Sync Gemini audio level to the Buddy store
      useBuddyState.getState().setAudioLevel(level)
    },
  })

  // Map live state to voice state for the visualizer & StatusDisplay
  const effectiveVoiceState = getEffectiveVoiceState(liveMode, geminiLive.state, voiceState)

  // Unified handleTap — uses Live mode or legacy
  const handleTap = useCallback(() => {
    if (geminiLive.state === "connecting") {
      return
    }

    if (geminiLive.state === "disconnected" || geminiLive.state === "error") {
      cancelAll()
      geminiLive.clearError()
      geminiLive.connect()
      return
    }

    geminiLive.disconnect()
  }, [geminiLive, cancelAll])

  const effectiveErrorMessage = liveMode
    ? (geminiLive.error || error)
    : error

  // Unified status text — not used by StatusDisplay (it uses state), kept for compatibility
  const effectiveStatusText = getEffectiveStatusText(
    liveMode,
    geminiLive.state,
    liveTranscriptIn,
    liveTranscriptOut,
    geminiLive.error,
    statusText,
  )

  // Show live output transcript as lastResponse for the UI (what Missi said — appears during speaking)
  const effectiveLastResponse = getEffectiveTranscriptValue(
    liveMode,
    geminiLive.state,
    liveTranscriptOut,
    lastResponse,
  )

  // Show live input transcript as lastTranscript (what user said — appears during listening)
  const effectiveLastTranscript = getEffectiveTranscriptValue(
    liveMode,
    geminiLive.state,
    liveTranscriptIn,
    lastTranscript,
  )

  useEffect(() => {
    const nextBuddyError = liveMode
      ? (geminiLive.error || error)
      : error

    if (!nextBuddyError) {
      lastBuddyErrorRef.current = null
      return
    }

    if (lastBuddyErrorRef.current === nextBuddyError) {
      return
    }

    lastBuddyErrorRef.current = nextBuddyError
    useBuddyState.getState().sayError(nextBuddyError, 3400)
  }, [error, geminiLive.error, liveMode])

  // Clear live transcripts when turn ends so they fade out
  useEffect(() => {
    if (!liveMode) return
    if (geminiLive.state === "connected" && liveTranscriptIn) {
      // User is listening — keep transcript visible
    }
    if (geminiLive.state === "connected" && !liveTranscriptIn && !liveTranscriptOut) {
      // Turn fully complete, transcripts already cleared
    }
  }, [liveMode, geminiLive.state, liveTranscriptIn, liveTranscriptOut])

  // Plugin system
  const {
    plugins,
    executeVoiceCommand,
    lastResult: pluginResult,
    clearResult: clearPluginResult,
  } = usePlugins()

  useChatPageEffects({
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
  })

  const handleLogout = useCallback(() => {
    cancelAll()
    signOut().catch(() => { }); setTimeout(() => { window.location.href = "/" }, 500)
  }, [signOut, cancelAll])

  // Soft reset for "Chat" sidebar item: cancel voice, clear conversation, refresh greeting gate, push /chat
  const handleNewChat = useCallback(() => {
    cancelAll()
    if (liveMode && geminiLive.state !== "disconnected") {
      geminiLive.disconnect()
    }
    conversationRef.current = []
    setLiveTranscriptIn("")
    setLiveTranscriptOut("")
    resetGreetingSession()
    router.push('/chat')
  }, [cancelAll, liveMode, geminiLive, resetGreetingSession, router])

  const handleDismissDisplay = useCallback(() => {
    if (pluginResult) clearPluginResult()
  }, [pluginResult, clearPluginResult])

  return (
    <ChatPageShell
      isGuest={isGuest}
      audioLevel={audioLevel}
      billingLoading={billingLoading}
      bootCompleted={bootCompleted}
      completeBootSequence={completeBootSequence}
      currentEmotion={currentEmotion}
      dismissOnboarding={dismissOnboarding}
      displayName={displayName}
      effectiveLastResponse={effectiveLastResponse}
      effectiveLastTranscript={effectiveLastTranscript}
      effectiveStatusText={effectiveStatusText}
      effectiveVoiceState={effectiveVoiceState}
      errorMessage={effectiveErrorMessage}
      handleTap={handleTap}
      isAtLimit={isAtLimit}
      limitSeconds={limitSeconds}
      liveMode={liveMode}
      onDismissDisplay={handleDismissDisplay}
      onDismissError={() => {
        geminiLive.clearError()
        setError(null)
      }}
      onLogout={isGuest ? () => {} : handleLogout}
      onNewChat={handleNewChat}
      onUpgrade={() => initiateCheckout('pro')}
      planId={plan?.id}
      pluginResult={pluginResult}
      showBootSequence={showBootSequence}
      showOnboarding={showOnboarding}
      streamingText={streamingText}
      usedSeconds={usedSeconds}
      voiceState={voiceState}
    />)
}
