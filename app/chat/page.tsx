"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import nextDynamic from "next/dynamic"
import { ArrowLeft, X } from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"
import { useVoiceStateMachine } from "@/hooks/useVoiceStateMachine"
import { useGeminiLive } from "@/hooks/useGeminiLive"
import { buildSystemPrompt } from "@/services/ai.service"
import { useChatSettings, type AIDialSettings } from "@/hooks/useChatSettings"
import { AGENT_FUNCTION_DECLARATIONS } from "@/lib/ai/agent-tools"
import { useProactive } from "@/hooks/useProactive"
import { useActionEngine } from "@/hooks/useActionEngine"
import { usePlugins } from "@/hooks/usePlugins"
import { useBilling } from "@/hooks/useBilling"
import { PERSONALITY_OPTIONS, type PersonalityKey, type ConversationEntry } from "@/types/chat"
import { VoiceButton } from "@/components/chat/VoiceButton"
import { StatusDisplay } from "@/components/chat/StatusDisplay"
import { ChatSidebar } from "@/components/chat/ChatSidebar"
import { ConversationLog } from "@/components/chat/ConversationLog"
import { ActionCard } from "@/components/chat/ActionCard"
import { UsageBar } from "@/components/chat/UsageBar"
import { BootSequence } from "@/components/chat/BootSequence"
import { AgentSteps } from "@/components/chat/AgentSteps"
import { OnboardingTour, shouldShowOnboarding } from "@/components/chat/OnboardingTour"
import { Magnetic } from "@/components/ui/Magnetic"
import { DailyBriefBanner } from "@/components/chat/DailyBriefBanner"

import { detectPluginCommand } from "@/lib/plugins/plugin-registry"
import { hasCompletedSetupLocally, markSetupCompleteLocally } from "@/lib/setupCompletion"
import type { ActionResult } from "@/types/actions"
import type { PluginId, PluginResult } from "@/types/plugins"

// Dynamic import — keeps three.js OUT of the server/edge bundle (~5MB saved)
const ParticleVisualizer = nextDynamic(
  () => import("@/components/chat/ParticleVisualizer").then((m) => m.ParticleVisualizer),
  { ssr: false }
)

const isFullDevBootstrap = process.env.NODE_ENV !== 'development' || process.env.NEXT_PUBLIC_ENABLE_CF_DEV === '1'

/** Convert a PluginResult to an ActionResult shape for display in ActionCard. */
function pluginResultToActionResult(result: PluginResult): ActionResult {
  const typeMap: Record<PluginId, ActionResult["type"]> = {
    notion: "take_note",
    google_calendar: "set_reminder",
    webhook: "web_search",
  }
  return {
    success: result.success,
    type: typeMap[result.pluginId] ?? "none",
    output: result.output,
    data: result.url ? { url: result.url } : undefined,
    actionTaken: `${result.pluginId}: ${result.action}`,
    canUndo: false,
    executedAt: result.executedAt,
  }
}

export default function VoiceAssistantPage() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const { plan, isAtLimit, usedSeconds, limitSeconds, isLoading: billingLoading, initiateCheckout, incrementUsageLocally } = useBilling()
  const [avatarTier, setAvatarTier] = useState<import('@/types/gamification').AvatarTier>(1)
  const [activePanel, setActivePanel] = useState<'settings' | 'plugins' | 'personas' | null>(null)
  const [personality, setPersonality] = useState<PersonalityKey>("assistant")
  const [customPrompt, setCustomPrompt] = useState("")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const personalityRef = useRef<PersonalityKey>("assistant")
  const customPromptRef = useRef("")
  const memoriesRef = useRef("")
  const [memoriesState, setMemoriesState] = useState("")
  const conversationRef = useRef<ConversationEntry[]>([])
  const greetedRef = useRef(false)
  const proactiveSpokenRef = useRef(false)
  const [showBootSequence, setShowBootSequence] = useState(false)
  const [bootCompleted, setBootCompleted] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)

  // Voice Persona state

  const [activePersona, setActivePersona] = useState<{ personaId: string; displayName: string; accentColor: string; geminiVoiceName: string } | null>(null)

  // Read user name from localStorage (set during setup) as fallback when Clerk hasn't loaded yet
  const [localName, setLocalName] = useState('')
  useEffect(() => {
    try {
      const stored = localStorage.getItem('missi-user-name')
      if (stored) setLocalName(stored)
    } catch { }
  }, [])

  // Resolved display name: prefer Clerk's firstName, fallback to localStorage name
  const displayName = user?.firstName || localName || ''

  // ── Client-side setup guard (replaces server-side layout check) ──
  // If the user's Clerk publicMetadata doesn't have setupComplete, redirect
  // to /setup. This was previously in chat/layout.tsx as a server-side check
  // but was moved here to avoid requiring edge runtime on the layout, which
  // bloats the Cloudflare bundle by ~2MB.
  const router = useRouter()
  useEffect(() => {
    if (!isLoaded || !user) return

    const setupDone = Boolean((user.publicMetadata as { setupComplete?: boolean } | undefined)?.setupComplete) || hasCompletedSetupLocally()

    if (setupDone) {
      markSetupCompleteLocally()
      return
    }

    if (!setupDone) {
      router.replace('/setup')
    }
  }, [isLoaded, user, router])

  // Vision State
  const imagePayloadRef = useRef<string | null>(null)
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Visual Memory State — for "Save to Memory" flow (separate from voice chat)
  const [visualNote, setVisualNote] = useState('')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [visualResult, setVisualResult] = useState<{
    title: string
    recallHint: string
    tags: string[]
  } | null>(null)
  const visualResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSaveToMemory = async () => {
    if (!thumbnail || !imagePayloadRef.current || isAnalyzing) return

    // Convert the already-computed canvas JPEG (1024px, 0.85 quality) to a Blob.
    // Using the compressed version avoids sending a raw 3-5MB file which
    // can hit the 30s Gemini timeout on slow connections.
    const dataUrl = imagePayloadRef.current // "data:image/jpeg;base64,..."
    const base64Data = dataUrl.split(',')[1]
    const binaryStr = atob(base64Data)
    const imgBytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) imgBytes[i] = binaryStr.charCodeAt(i)
    const blob = new Blob([imgBytes], { type: 'image/jpeg' })
    const compressedFile = new File([blob], 'visual-memory.jpg', { type: 'image/jpeg' })

    setIsAnalyzing(true)
    setVisualResult(null)

    const formData = new FormData()
    formData.append('file', compressedFile)
    if (visualNote.trim()) {
      formData.append('note', visualNote.trim().slice(0, 200))
    }

    try {
      const res = await fetch('/api/v1/visual-memory/analyze', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (!res.ok) {
        const code = data?.code ?? ''
        let msg = 'Couldn\'t save that image. Please try again.'
        if (res.status === 413 || code === 'PAYLOAD_TOO_LARGE') {
          msg = 'Image too large — please use a photo under 5MB'
        } else if (res.status === 415 || code === 'UNSUPPORTED_MEDIA_TYPE') {
          msg = 'This file type isn\'t supported. Try JPEG, PNG, or WebP'
        } else if (res.status === 429 || code === 'RATE_LIMIT_EXCEEDED') {
          msg = data?.error ?? 'You\'ve reached your daily image limit. Upgrade to Pro for more.'
        }
        // Show error as the visual result so it appears in the UI
        setVisualResult({ title: msg, recallHint: '', tags: [] })
      } else {
        // Success — show synthetic confirmation message
        setVisualResult({
          title: data.title ?? 'Saved to memory',
          recallHint: data.recallHint ?? '',
          tags: data.tags ?? [],
        })
        // Clear the image and note
        setThumbnail(null)
        imagePayloadRef.current = null
        setVisualNote('')
        // Reset file input so the same file can be selected again
        if (fileInputRef.current) fileInputRef.current.value = ''
        // Refresh memories so the next Gemini Live session includes this visual memory
        fetchMemories().catch(() => {})
      }
    } catch {
      setVisualResult({ title: 'Couldn\'t save that image. Please try again.', recallHint: '', tags: [] })
    } finally {
      setIsAnalyzing(false)
      // Auto-dismiss result after 8 seconds
      if (visualResultTimerRef.current) clearTimeout(visualResultTimerRef.current)
      visualResultTimerRef.current = setTimeout(() => setVisualResult(null), 8000)
    }
  }

  // Clean up auto-dismiss timer on unmount
  useEffect(() => {
    return () => {
      if (visualResultTimerRef.current) clearTimeout(visualResultTimerRef.current)
    }
  }, [])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Use createObjectURL instead of readAsDataURL — drastically more
    // memory-efficient on mobile (iPhone 12MP photos are 10-12MB as data URLs
    // which crash mobile Safari's Image loader)
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl) // free memory immediately

      const canvas = document.createElement("canvas")
      let width = img.width
      let height = img.height
      // 1024px preserves text readability for OCR (marks, names, numbers)
      const maxSize = 1024

      if (width > height && width > maxSize) {
        height = Math.round(height * maxSize / width)
        width = maxSize
      } else if (height > maxSize) {
        width = Math.round(width * maxSize / height)
        height = maxSize
      }

      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) return
      ctx.drawImage(img, 0, 0, width, height)

      // JPEG at 0.85 quality — good text clarity, ~150-300KB payload
      const compressedBase64 = canvas.toDataURL("image/jpeg", 0.85)
      imagePayloadRef.current = compressedBase64
      setThumbnail(compressedBase64)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      console.error("Failed to load image for compression")
    }

    img.src = objectUrl
  }

  useEffect(() => {
    try {
      const isNewUser = new URLSearchParams(window.location.search).get('new') === 'true'
      if (isNewUser || !localStorage.getItem('missi-boot-v1')) {
        setShowBootSequence(true)
      } else {
        setBootCompleted(true)
      }
    } catch {
      setBootCompleted(true)
    }
  }, [])

  // Restore session state from sessionStorage so re-visiting chat doesn't replay greeting/proactive
  useEffect(() => {
    try {
      greetedRef.current = sessionStorage.getItem('missi-greeted') === '1'
      proactiveSpokenRef.current = sessionStorage.getItem('missi-proactive-spoken') === '1'
    } catch { }
  }, [])

  // Track current voiceState in a ref for use in async callbacks / timeouts
  const voiceStateRef = useRef<string>("idle")

  // ── Live Settings sync ───────────────────────────────────────────────────
  // Shared settings are authored on /settings. We subscribe here so every
  // chat turn reads the freshest personality, customPrompt, voiceEnabled,
  // AI dials, incognito and analytics-opt-out without requiring a reload.
  const sharedSettings = useChatSettings()
  const aiDialsRef = useRef<AIDialSettings | null>(sharedSettings.aiDials)
  const incognitoRef = useRef<boolean>(sharedSettings.privacy.memoryPaused)
  const analyticsOptOutRef = useRef<boolean>(sharedSettings.privacy.analyticsOptOut)
  const voiceEnabledFromSettingsRef = useRef<boolean>(sharedSettings.voiceEnabled)

  useEffect(() => {
    aiDialsRef.current = sharedSettings.aiDials
  }, [sharedSettings.aiDials])

  useEffect(() => {
    incognitoRef.current = sharedSettings.privacy.memoryPaused
  }, [sharedSettings.privacy.memoryPaused])

  useEffect(() => {
    analyticsOptOutRef.current = sharedSettings.privacy.analyticsOptOut
  }, [sharedSettings.privacy.analyticsOptOut])

  useEffect(() => {
    voiceEnabledFromSettingsRef.current = sharedSettings.voiceEnabled
    setVoiceEnabled(sharedSettings.voiceEnabled)
  }, [sharedSettings.voiceEnabled])

  // Mirror personality / customPrompt from settings page into local state.
  // The local state still drives UI (personality pill), but now updates
  // propagate instantly when the user changes it on /settings.
  useEffect(() => {
    const p = sharedSettings.personality
    if (p && p !== personalityRef.current) {
      setPersonality(p)
      personalityRef.current = p
    }
  }, [sharedSettings.personality])

  useEffect(() => {
    if (sharedSettings.customPrompt !== customPromptRef.current) {
      setCustomPrompt(sharedSettings.customPrompt)
      customPromptRef.current = sharedSettings.customPrompt
    }
  }, [sharedSettings.customPrompt])

  const {
    state: voiceState, audioLevel, statusText, lastTranscript,
    error, setError, streamingText, lastResponse, handleTap: legacyHandleTap, cancelAll, greet, saveMemoryBeacon,
    currentEmotion, agentSteps, getLastRecordingDurationMs,
  } = useVoiceStateMachine({
    userId: user?.id,
    personalityRef,
    customPromptRef,
    memoriesRef,
    conversationRef,
    imagePayloadRef,
    onImageConsumed: () => setThumbnail(null),
    aiDialsRef,
    incognitoRef,
    analyticsOptOutRef,
  })

  // ── Real-time Voice Mode ──────────────────────────────────────────────────
  // Default ON — instant, real-time voice (Missi Voice).
  // Switches OFF only when user explicitly picks an AI persona.
  const [liveMode, setLiveMode] = useState(true)
  const [liveTranscriptIn, setLiveTranscriptIn] = useState("")
  const [liveTranscriptOut, setLiveTranscriptOut] = useState("")

  const geminiLive = useGeminiLive({
    systemPrompt: buildSystemPrompt(personalityRef.current, memoriesState, customPrompt),
    voiceName: "Kore", // Always Kore for Gemini Live — personas only affect ElevenLabs voice
    // EDITH: pass agent tool declarations for live voice tool calling
    toolDeclarations: AGENT_FUNCTION_DECLARATIONS,
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
      // Model started speaking → clear user's transcript so UI shows "Speaking..." cleanly
      if (s === "speaking") {
        setLiveTranscriptIn("")
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
  })

  // Map live state to voice state for the visualizer & StatusDisplay
  const effectiveVoiceState = liveMode && geminiLive.state !== "disconnected"
    ? (geminiLive.state === "speaking" ? "speaking" : geminiLive.state === "connected" ? "recording" : geminiLive.state === "connecting" ? "thinking" : "idle")
    : voiceState

  // Unified handleTap — uses Live mode or legacy
  const handleTap = useCallback(() => {
    // Close settings/plugins panel if open
    if (activePanel !== null) {
      setActivePanel(null)
      return
    }
    if (liveMode) {
      if (geminiLive.state === "disconnected" || geminiLive.state === "error") {
        // Cancel any legacy audio that might still be playing
        cancelAll()
        geminiLive.connect()
      } else {
        geminiLive.disconnect()
      }
    } else {
      legacyHandleTap()
    }
  }, [liveMode, geminiLive, legacyHandleTap, cancelAll, activePanel])

  // Unified status text — not used by StatusDisplay (it uses state), kept for compatibility
  const effectiveStatusText = liveMode && geminiLive.state !== "disconnected"
    ? geminiLive.state === "connecting" ? "Starting..."
    : geminiLive.state === "connected" ? (liveTranscriptIn || "Listening...")
    : geminiLive.state === "speaking" ? (liveTranscriptOut || "Speaking...")
    : geminiLive.error || "Tap to start"
    : statusText

  // Show live output transcript as lastResponse for the UI (what Missi said — appears during speaking)
  const effectiveLastResponse = liveMode && geminiLive.state !== "disconnected"
    ? liveTranscriptOut
    : lastResponse

  // Show live input transcript as lastTranscript (what user said — appears during listening)
  const effectiveLastTranscript = liveMode && geminiLive.state !== "disconnected"
    ? liveTranscriptIn
    : lastTranscript

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

  // Keep voiceState ref in sync
  useEffect(() => { voiceStateRef.current = effectiveVoiceState }, [effectiveVoiceState])

  // Proactive intelligence
  const { briefing, nudges, dismissItem, markDelivered } = useProactive()

  // Action engine
  const { detectAndExecute, lastResult, clearResult } = useActionEngine()
  const lastResponseForActionRef = useRef("")

  // Plugin system
  const {
    plugins,
    executeVoiceCommand,
    lastResult: pluginResult,
    clearResult: clearPluginResult,
  } = usePlugins()
  const lastResponseForPluginRef = useRef("")

  useEffect(() => {
    try {
      const s = localStorage.getItem("missi-personality") as PersonalityKey | null
      if (s && PERSONALITY_OPTIONS.some((p) => p.key === s)) { setPersonality(s); personalityRef.current = s }
      const c = localStorage.getItem("missi-custom-prompt")
      if (c) {
        setCustomPrompt(c)
        customPromptRef.current = c
      }
    } catch { }
  }, [])

  // Enforce tier limits: if a user downgrades to free, fallback to 'assistant'
  useEffect(() => {
    if (billingLoading || !isLoaded) return // wait for plan
    const pOpt = PERSONALITY_OPTIONS.find((p) => p.key === personality)
    if (pOpt) {
      const isPremium = pOpt.requiredPlan === 'plus' || pOpt.requiredPlan === 'pro'
      const isLocked = isPremium && (!plan || plan.id === 'free')
      if (isLocked) {
        setPersonality('assistant')
        personalityRef.current = 'assistant'
        try { localStorage.setItem("missi-personality", 'assistant') } catch {}
      }
    }
  }, [plan, billingLoading, isLoaded, personality])

  const fetchMemories = useCallback(async () => {
    try {
      const d = await fetch('/api/v1/memory').then(r => r.json())
      if (d.data?.nodes?.length) {
        const mem = d.data.nodes
          .map((n: any) => `${n.category}: ${n.title} — ${n.detail}`)
          .join("\n")
        memoriesRef.current = mem
        setMemoriesState(mem)
      }
    } catch { }
  }, [])

  useEffect(() => {
    if (!isLoaded || !user?.id) return
    fetchMemories()
  }, [isLoaded, user?.id, fetchMemories])

  // Fetch active persona info on load (display only — does NOT switch off real-time voice)
  useEffect(() => {
    if (!isLoaded || !user?.id) return
    let cancelled = false
    const load = () => {
      fetch('/api/v1/persona').then(r => r.json())
        .then(d => {
          if (cancelled) return
          if (d.displayName) {
            setActivePersona({
              personaId: d.personaId ?? 'calm',
              displayName: d.displayName ?? 'calm',
              accentColor: d.accentColor ?? '#7DD3FC',
              geminiVoiceName: d.geminiVoiceName ?? 'Kore',
            })
          }
        }).catch(() => {})
    }

    if (isFullDevBootstrap) {
      load()
    } else {
      const timer = setTimeout(load, 5500)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    return () => {
      cancelled = true
    }
  }, [isLoaded, user?.id])

  // Fetch avatar data for the navbar ring
  useEffect(() => {
    if (!isLoaded || !user?.id) return
    let cancelled = false
    const load = () => {
      fetch('/api/v1/streak').then(r => r.json())
        .then(d => {
          if (cancelled) return
          if (d?.success && d.data) {
            setAvatarTier(d.data.avatarTier ?? 1)
          }
        }).catch(() => {})
    }

    if (isFullDevBootstrap) {
      load()
    } else {
      const timer = setTimeout(load, 6000)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    return () => {
      cancelled = true
    }
  }, [isLoaded, user?.id])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) { e.preventDefault(); if (!isAtLimit && !billingLoading) handleTap() }
      if (e.code === "Escape") cancelAll()
    }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [handleTap, cancelAll, isAtLimit, billingLoading])
  useEffect(() => () => { cancelAll() }, [cancelAll])
  useEffect(() => {
    const bu = () => saveMemoryBeacon()
    const vc = () => { if (document.visibilityState === "hidden") saveMemoryBeacon() }
    window.addEventListener("beforeunload", bu); document.addEventListener("visibilitychange", vc)
    return () => { window.removeEventListener("beforeunload", bu); document.removeEventListener("visibilitychange", vc) }
  }, [saveMemoryBeacon])

  // Initial greeting — skip when Live mode is ON (Gemini handles its own conversation)
  useEffect(() => {
    if (liveMode) return // Live mode — skip legacy ElevenLabs greeting
    if (!isLoaded || greetedRef.current || isAtLimit || billingLoading) return
    if (showBootSequence && !bootCompleted) return // wait for boot

    greetedRef.current = true
    try { sessionStorage.setItem('missi-greeted', '1') } catch { }

    let isNewUser = false
    try {
      isNewUser = new URLSearchParams(window.location.search).get('new') === 'true'
      if (isNewUser) {
        window.history.replaceState({}, document.title, window.location.pathname)
      }
    } catch { }

    const n = displayName

    let delay = 1200
    let greetingToSay = ""

    if (isNewUser) {
      greetingToSay = `Hello ${n}, nice to finally meet you! Let's get started.`
      delay = 2000 // wait a bit longer for the boot sequence to fully settle
    } else {
      const gs = [
        `Hey${n ? ` ${n}` : ""}! What's up, how's it going?`,
        `Hey${n ? ` ${n}` : ""}! Good to see you, what can I help with?`,
        `Hey${n ? ` ${n}` : ""}! How are you doing today?`
      ]
      greetingToSay = gs[Math.floor(Math.random() * gs.length)]
    }

    setTimeout(() => greet(greetingToSay), delay)
  }, [isLoaded, user, greet, isAtLimit, billingLoading, showBootSequence, bootCompleted, liveMode, displayName])

  // Proactive JARVIS moment: auto-speak first high-priority briefing item (legacy only)
  useEffect(() => {
    if (liveMode) return // Live mode — skip legacy proactive speech
    if (!briefing || proactiveSpokenRef.current || !voiceEnabled || isAtLimit || billingLoading) return
    const highItem = briefing.items.find(
      (item) => item.priority === "high" && !item.dismissedAt,
    )
    if (!highItem) return

    const timer = setTimeout(() => {
      // Only speak if state is idle at the time the timer fires
      if (voiceStateRef.current === "idle") {
        proactiveSpokenRef.current = true
        try { sessionStorage.setItem('missi-proactive-spoken', '1') } catch { }
        greet(highItem.message)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [briefing, voiceEnabled, greet, isAtLimit, billingLoading, liveMode])

  // Store last interaction time for nudge engine
  useEffect(() => {
    if (voiceState === "recording") {
      try { localStorage.setItem("missi-last-interaction-at", String(Date.now())) } catch { }
    }
  }, [voiceState])

  const handleLogout = useCallback(() => {
    cancelAll(); setActivePanel(null)
    signOut().catch(() => { }); setTimeout(() => { window.location.href = "/" }, 500)
  }, [signOut, cancelAll])

  // Soft reset for "Chat" sidebar item: cancel voice, clear conversation, refresh greeting gate, push /chat
  const handleNewChat = useCallback(() => {
    cancelAll()
    if (liveMode && geminiLive.state !== "disconnected") {
      geminiLive.disconnect()
    }
    conversationRef.current = []
    setActivePanel(null)
    setLiveTranscriptIn("")
    setLiveTranscriptOut("")
    try { sessionStorage.removeItem('missi-greeted') } catch { }
    greetedRef.current = false
    router.push('/chat')
  }, [cancelAll, liveMode, geminiLive, router])

  // Sidebar width reported by ChatSidebar (0 on mobile). Used to offset fixed chat children.
  const [sidebarWidth, setSidebarWidth] = useState(240)

  // Trigger action detection when user speaks (lastTranscript changes)
  useEffect(() => {
    if (!lastTranscript || lastTranscript === lastResponseForActionRef.current) return
    lastResponseForActionRef.current = lastTranscript

    const last3 = conversationRef.current
      .slice(-6)
      .map((e) => `${e.role}: ${e.content}`)
      .join("\n")

    detectAndExecute(lastTranscript, last3).catch(() => { })
  }, [lastTranscript, detectAndExecute])

  // Check for plugin commands after each AI response
  useEffect(() => {
    if (!lastResponse || lastResponse === lastResponseForPluginRef.current) return
    lastResponseForPluginRef.current = lastResponse

    // Increment local usage counter so UsageBar updates immediately
    // (server already incremented via checkAndIncrementVoiceTime in the chat API)
    incrementUsageLocally(getLastRecordingDurationMs())

    if (!lastTranscript) return

    const connectedIds = plugins
      .filter((p) => p.status === "connected")
      .map((p) => p.id as PluginId)

    if (connectedIds.length === 0) return

    const matchedPlugin = detectPluginCommand(lastTranscript, connectedIds)
    if (matchedPlugin) {
      executeVoiceCommand(matchedPlugin, lastTranscript).catch(() => { })
    }
  }, [lastResponse, lastTranscript, plugins, executeVoiceCommand, incrementUsageLocally, getLastRecordingDurationMs])

  const handleActionCopy = useCallback(() => {
    if (!lastResult) return
    const text = (lastResult.data?.fullDraft as string) ?? lastResult.output
    navigator.clipboard.writeText(text).catch(() => { })
  }, [lastResult])

  // Determine what to show in ActionCard: prefer plugin result if present, else action result
  const displayResult = pluginResult
    ? pluginResultToActionResult(pluginResult)
    : lastResult

  const handleDismissDisplay = useCallback(() => {
    if (pluginResult) clearPluginResult()
    else clearResult()
  }, [pluginResult, clearPluginResult, clearResult])

  return (
    <div className="fixed inset-0 flex gap-2 md:gap-3 p-2 md:p-3 bg-black text-white overflow-hidden select-none"
      style={{ fontFamily: "var(--font-body)", ['--chat-sidebar-width' as any]: `${sidebarWidth}px` }}>
      {/* Hide global footer on chat page */}
      <style>{`[data-testid="global-footer"] { display: none !important; }`}</style>

      <ChatSidebar
        plan={plan?.id}
        onLogout={handleLogout}
        onNewChat={handleNewChat}
        isLiveMode={liveMode}
        activePersona={activePersona}
        onPersonaChange={(p) => {
          setActivePersona({
            personaId: p.personaId,
            displayName: p.displayName,
            accentColor: p.accentColor,
            geminiVoiceName: p.geminiVoiceName,
          })
          if (liveMode) {
            geminiLive.disconnect()
            setLiveMode(false)
          }
        }}
        onSwitchToLive={() => {
          setLiveMode(true)
          setActivePersona(null)
        }}
        onPickImage={() => fileInputRef.current?.click()}
        onWidthChange={setSidebarWidth}
      />

      <main
        className="relative flex-1 min-w-0 h-full overflow-hidden rounded-2xl md:rounded-3xl"
        style={{
          background: "#000",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow:
            "0 20px 60px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.02)",
        }}
      >

      {/* Daily brief banner — fire-and-forget, never blocks chat */}
      <div className="absolute top-0 left-0 right-0 z-[200] p-3 md:p-4 pointer-events-auto" style={{ maxWidth: 600, margin: '0 auto' }}>
        <DailyBriefBanner />
      </div>
      {showBootSequence && !bootCompleted && (
        <BootSequence
          userName={displayName || "Guest"}
          onComplete={() => {
            try { localStorage.setItem('missi-boot-v1', 'true') } catch { }
            setBootCompleted(true)
            // Trigger onboarding tour for new users after boot
            if (shouldShowOnboarding()) {
              setShowOnboarding(true)
            }
          }}
        />
      )}
      {showOnboarding && (
        <OnboardingTour onComplete={() => setShowOnboarding(false)} />
      )}
      <ParticleVisualizer state={effectiveVoiceState} isActive={effectiveVoiceState !== "idle"} audioLevel={audioLevel} avatarTier={avatarTier} />
      <div className="absolute inset-0 z-10" onClick={isAtLimit || billingLoading ? undefined : handleTap} data-testid="voice-tap-area"
        style={{ cursor: isAtLimit || billingLoading ? "default" : voiceState === "idle" || voiceState === "speaking" ? "pointer" : "default" }} />
      {/* On mobile: offset from left to clear the fixed sidebar hamburger (48px).
          On desktop: 600px centered. */}
      <div className="relative w-auto md:w-[600px] ml-12 mr-3 md:mx-auto z-[100] pointer-events-none">
        <nav className="flex items-center justify-between w-full mt-12 md:mt-6 px-4 py-2.5 pointer-events-auto rounded-[32px] shadow-2xl"
          style={{
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}>
          {/* Left: Back — hidden on mobile (sidebar hamburger handles navigation) */}
          <div className="flex items-center flex-1 justify-start gap-2">
            <Magnetic>
              <Link href="/" className="hidden md:flex items-center justify-center p-2 rounded-full opacity-60 hover:opacity-100 hover:bg-white/10 transition-all text-white" data-testid="home-link">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Magnetic>
          </div>

          {/* Center: MISSI */}
          <div className="flex justify-center select-none flex-none">
            <svg width="90" height="20" viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="led-nav" width="3" height="2" patternUnits="userSpaceOnUse">
                  <rect x="0.25" y="0.25" width="2.5" height="1.5" rx="0.4" fill="rgba(255,255,255,1)" />
                </pattern>
                <mask id="text-mask-nav">
                  <rect width="100%" height="100%" fill="black" />
                  <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
                    fontSize="28" fontWeight="500" fontFamily="'VT323','Space Mono',monospace"
                    fill="white" letterSpacing="5">MISSI</text>
                </mask>
              </defs>
              <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
                fontSize="28" fontWeight="500" fontFamily="'VT323','Space Mono',monospace"
                fill="#ffffff" opacity="0.3" style={{ filter: 'blur(4px)' }} letterSpacing="5">MISSI</text>
              <rect width="100%" height="100%" fill="url(#led-nav)" mask="url(#text-mask-nav)" />
            </svg>
          </div>

          {/* Right: empty spacer so MISSI stays centered */}
          <div className="flex items-center flex-1 justify-end" aria-hidden />
        </nav>
      </div>




      <ConversationLog messages={conversationRef.current} isVisible={false} />

      {/* ── Action Card Overlay — above everything ─── */}
      {displayResult && (
        <div className="absolute bottom-32 md:bottom-36 left-0 right-0 z-50 flex justify-center pointer-events-none"
          data-testid="action-card-container">
          <ActionCard
            result={displayResult}
            onDismiss={handleDismissDisplay}
            onCopy={
              !pluginResult && (lastResult?.type === "draft_email" || lastResult?.type === "draft_message")
                ? handleActionCopy
                : undefined
            }
          />
        </div>
      )}

      {/* ── Main Voice Controls Dock ─── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pointer-events-none"
        style={{
          paddingBottom: plan?.id === 'free'
            ? 'calc(52px + env(safe-area-inset-bottom))'
            : 'calc(2.5rem + env(safe-area-inset-bottom))',
        }}>

        {/* Visual Memory Result Card — shown after successful analysis or on error */}
        {visualResult && (
          <div className="mb-3 pointer-events-auto w-72 rounded-2xl px-4 py-3 shadow-xl"
            style={{ background: 'rgba(0,255,140,0.07)', border: '1px solid rgba(0,255,140,0.15)', backdropFilter: 'blur(20px)' }}>
            <p className="text-[11px] font-medium mb-0.5" style={{ color: 'rgba(0,255,140,0.9)' }}>
              {visualResult.recallHint ? `Got it! I've saved this to your visual memory.` : visualResult.title}
            </p>
            {visualResult.recallHint && (
              <>
                <p className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  {visualResult.title} ✨
                </p>
                <p className="text-[10px] italic mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                  Try asking: "{visualResult.recallHint}"
                </p>
                {visualResult.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {visualResult.tags.slice(0, 5).map((tag) => (
                      <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
            <button onClick={() => setVisualResult(null)}
              className="absolute top-2 right-2 text-white/30 hover:text-white/60 transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'absolute' }}>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Thumbnail Preview — shown when image is attached, before saving */}
        {thumbnail && !isAnalyzing && (
          <div className="mb-3 pointer-events-auto flex flex-col items-center gap-2">
            <div className="relative">
              <img src={thumbnail} alt="Upload preview" className="w-16 h-16 object-cover rounded-xl border border-white/20" />
              <button onClick={(e) => {
                e.stopPropagation()
                setThumbnail(null)
                imagePayloadRef.current = null
                setVisualNote('')
                if (fileInputRef.current) fileInputRef.current.value = ''
              }}
                className="absolute -top-2 -right-2 bg-black text-white rounded-full p-0.5 border border-white/20 hover:scale-110 transition-transform">
                <X className="w-3 h-3" />
              </button>
            </div>
            {/* Optional note field */}
            <input
              type="text"
              value={visualNote}
              onChange={(e) => setVisualNote(e.target.value)}
              maxLength={200}
              placeholder="Add a note (optional)"
              className="w-64 text-[11px] px-3 py-1.5 rounded-full outline-none"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: 'rgba(255,255,255,0.75)',
              }}
              onClick={(e) => e.stopPropagation()}
            />
            {/* Save to Memory button */}
            <button
              onClick={(e) => { e.stopPropagation(); handleSaveToMemory() }}
              className="px-4 py-1.5 rounded-full text-[11px] font-medium transition-all hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(135deg, rgba(0,255,140,0.2), rgba(0,200,100,0.1))',
                border: '1px solid rgba(0,255,140,0.25)',
                color: 'rgba(0,255,140,0.9)',
                cursor: 'pointer',
              }}
            >
              Save to Memory
            </button>
          </div>
        )}

        {/* Loading state — while Gemini analyzes the image */}
        {isAnalyzing && (
          <div className="mb-3 pointer-events-none flex items-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white/70"
              style={{ animation: 'spin 0.8s linear infinite' }} />
            <p className="text-[11px] font-light" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Missi is saving this to memory...
            </p>
          </div>
        )}

        <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center", pointerEvents: "auto" }}>
          <VoiceButton
            state={effectiveVoiceState}
            onPress={handleTap}
            disabled={isAtLimit || billingLoading}
          />
        </div>
        <StatusDisplay
          state={effectiveVoiceState}
          streamingText={streamingText}
          lastResponse={effectiveLastResponse}
          errorMessage={geminiLive.error || error}
          onDismissError={() => setError(null)}
          userName={displayName}
          statusText={effectiveStatusText}
          lastTranscript={effectiveLastTranscript}
          briefing={briefing}
          nudges={nudges}
          onDismissItem={dismissItem}
          onBriefingDelivered={markDelivered}
          currentEmotion={currentEmotion}
          isLiveMode={liveMode}
        />
        <div className="mt-4 pointer-events-auto">
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
            <span className="hidden md:inline">Space to talk &middot; Esc to cancel</span>
            <span className="md:hidden">Tap anywhere</span>
          </p>
        </div>
      </div>

      {/* Agent Steps Visualizer — appears above the bottom dock */}
      <div className="absolute bottom-48 md:bottom-52 left-0 right-0 z-30 flex justify-center pointer-events-none">
        <AgentSteps steps={agentSteps} />
      </div>

      <UsageBar
        usedSeconds={usedSeconds}
        limitSeconds={limitSeconds}
        planId={plan?.id ?? 'free'}
        onUpgrade={() => initiateCheckout('pro')}
      />

      {/* Hidden file input — triggered by sidebar More → Vision */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={fileInputRef}
        className="hidden"
        onChange={handleImageSelect}
      />

      </main>
    </div>)
}
