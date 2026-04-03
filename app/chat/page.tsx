"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import nextDynamic from "next/dynamic"
import { ArrowLeft, Brain, Settings, X, Crown } from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"
import { useVoiceStateMachine } from "@/hooks/useVoiceStateMachine"
import { useProactive } from "@/hooks/useProactive"
import { useActionEngine } from "@/hooks/useActionEngine"
import { usePlugins } from "@/hooks/usePlugins"
import { useBilling } from "@/hooks/useBilling"
import { PERSONALITY_OPTIONS, type PersonalityKey, type ConversationEntry } from "@/types/chat"
import { VoiceButton } from "@/components/chat/VoiceButton"
import { StatusDisplay } from "@/components/chat/StatusDisplay"
import { SettingsPanel } from "@/components/chat/SettingsPanel"
import { ConversationLog } from "@/components/chat/ConversationLog"
import { ActionCard } from "@/components/chat/ActionCard"
import { PluginBadge } from "@/components/chat/PluginBadge"
import { UsageBar } from "@/components/chat/UsageBar"
import { detectPluginCommand } from "@/lib/plugins/plugin-registry"
import type { ActionResult } from "@/types/actions"
import type { PluginId, PluginResult } from "@/types/plugins"

// Dynamic import — keeps three.js OUT of the server/edge bundle (~5MB saved)
const ParticleVisualizer = nextDynamic(
  () => import("@/components/chat/ParticleVisualizer").then((m) => m.ParticleVisualizer),
  { ssr: false }
)

export const runtime = "edge"
export const dynamic = "force-dynamic"

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
  const { plan, usage, isAtLimit, isLoading: billingLoading, initiateRazorpayCheckout, incrementUsageLocally } = useBilling()
  const [showSettings, setShowSettings] = useState(false)
  const [personality, setPersonality] = useState<PersonalityKey>("bestfriend")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const personalityRef = useRef<PersonalityKey>("bestfriend")
  const memoriesRef = useRef("")
  const conversationRef = useRef<ConversationEntry[]>([])
  const greetedRef = useRef(false)
  const proactiveSpokenRef = useRef(false)

  // Restore session state from sessionStorage so re-visiting chat doesn't replay greeting/proactive
  useEffect(() => {
    try {
      greetedRef.current = sessionStorage.getItem('missi-greeted') === '1'
      proactiveSpokenRef.current = sessionStorage.getItem('missi-proactive-spoken') === '1'
    } catch {}
  }, [])

  // Track current voiceState in a ref for use in async callbacks / timeouts
  const voiceStateRef = useRef<string>("idle")

  const {
    state: voiceState, audioLevel, statusText, lastTranscript,
    error, setError, streamingText, lastResponse, handleTap, cancelAll, greet, saveMemoryBeacon,
    currentEmotion,
  } = useVoiceStateMachine({ userId: user?.id, personalityRef, memoriesRef, conversationRef })

  // Keep voiceState ref in sync
  useEffect(() => { voiceStateRef.current = voiceState }, [voiceState])

  // Proactive intelligence
  const { briefing, nudges, dismissItem, markDelivered } = useProactive()

  // Action engine
  const { detectAndExecute, lastResult, isExecuting, clearResult } = useActionEngine()
  const lastResponseForActionRef = useRef("")

  // Plugin system
  const {
    plugins,
    executeVoiceCommand,
    isConnected,
    lastResult: pluginResult,
    clearResult: clearPluginResult,
    connectPlugin,
    disconnectPlugin,
  } = usePlugins()
  const lastResponseForPluginRef = useRef("")

  useEffect(() => { try { const s = localStorage.getItem("missi-personality") as PersonalityKey | null
    if (s && PERSONALITY_OPTIONS.some((p) => p.key === s)) { setPersonality(s); personalityRef.current = s }
  } catch {} }, [])

  useEffect(() => { if (!isLoaded || !user?.id) return
    // Memory is fetched server-side via getVerifiedUserId() - no userId in URL
    fetch(`/api/v1/memory`).then((r) => r.json())
      .then((d) => {
        if (d.data?.nodes?.length) {
          memoriesRef.current = d.data.nodes.map((n: any) => `${n.category}: ${n.title} — ${n.detail}`).join("\n")
        }
      }).catch(() => {})
  }, [isLoaded, user?.id])

  const updatePersonality = useCallback((key: PersonalityKey) => {
    setPersonality(key); personalityRef.current = key
    try { localStorage.setItem("missi-personality", key) } catch {}; conversationRef.current = []
  }, [])

  useEffect(() => { const h = (e: KeyboardEvent) => {
    if (e.code === "Space" && e.target === document.body) { e.preventDefault(); if (!isAtLimit && !billingLoading) handleTap() }
    if (e.code === "Escape") cancelAll() }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [handleTap, cancelAll, isAtLimit, billingLoading])
  useEffect(() => () => { cancelAll() }, [cancelAll])
  useEffect(() => { const bu = () => saveMemoryBeacon()
    const vc = () => { if (document.visibilityState === "hidden") saveMemoryBeacon() }
    window.addEventListener("beforeunload", bu); document.addEventListener("visibilitychange", vc)
    return () => { window.removeEventListener("beforeunload", bu); document.removeEventListener("visibilitychange", vc) }
  }, [saveMemoryBeacon])

  // Initial greeting — skip if daily limit already reached or billing still loading
  useEffect(() => { if (!isLoaded || greetedRef.current || isAtLimit || billingLoading) return; greetedRef.current = true
    try { sessionStorage.setItem('missi-greeted', '1') } catch {}
    const n = user?.firstName || "", gs = [`Hey${n ? ` ${n}` : ""}! What's up, how's it going?`,
      `Hey${n ? ` ${n}` : ""}! Good to see you, what can I help with?`, `Hey${n ? ` ${n}` : ""}! How are you doing today?`]
    setTimeout(() => greet(gs[Math.floor(Math.random() * gs.length)]), 1200)
  }, [isLoaded, user, greet, isAtLimit, billingLoading])

  // Proactive JARVIS moment: auto-speak first high-priority briefing item
  useEffect(() => {
    if (!briefing || proactiveSpokenRef.current || !voiceEnabled || isAtLimit || billingLoading) return
    const highItem = briefing.items.find(
      (item) => item.priority === "high" && !item.dismissedAt,
    )
    if (!highItem) return

    const timer = setTimeout(() => {
      // Only speak if state is idle at the time the timer fires
      if (voiceStateRef.current === "idle") {
        proactiveSpokenRef.current = true
        try { sessionStorage.setItem('missi-proactive-spoken', '1') } catch {}
        greet(highItem.message)
      }
    }, 2000)

    return () => clearTimeout(timer)
  }, [briefing, voiceEnabled, greet, isAtLimit, billingLoading])

  // Store last interaction time for nudge engine
  useEffect(() => {
    if (voiceState === "recording") {
      try { localStorage.setItem("missi-last-interaction-at", String(Date.now())) } catch {}
    }
  }, [voiceState])

  const handleLogout = useCallback(() => { cancelAll(); setShowSettings(false)
    signOut().catch(() => {}); setTimeout(() => { window.location.href = "/" }, 500)
  }, [signOut, cancelAll])

  // Trigger action detection when user speaks (lastTranscript changes)
  useEffect(() => {
    if (!lastTranscript || lastTranscript === lastResponseForActionRef.current) return
    lastResponseForActionRef.current = lastTranscript

    const last3 = conversationRef.current
      .slice(-6)
      .map((e) => `${e.role}: ${e.content}`)
      .join("\n")

    detectAndExecute(lastTranscript, last3).catch(() => {})
  }, [lastTranscript, detectAndExecute])

  // Check for plugin commands after each AI response
  useEffect(() => {
    if (!lastResponse || lastResponse === lastResponseForPluginRef.current) return
    lastResponseForPluginRef.current = lastResponse

    // Increment local usage counter so UsageBar updates immediately
    // (server already incremented via incrementVoiceUsage in the chat API)
    if (plan?.id === 'free') incrementUsageLocally()

    if (!lastTranscript) return

    const connectedIds = plugins
      .filter((p) => p.status === "connected")
      .map((p) => p.id as PluginId)

    if (connectedIds.length === 0) return

    const matchedPlugin = detectPluginCommand(lastTranscript, connectedIds)
    if (matchedPlugin) {
      executeVoiceCommand(matchedPlugin, lastTranscript).catch(() => {})
    }
  }, [lastResponse, lastTranscript, plugins, executeVoiceCommand, plan?.id, incrementUsageLocally])

  const handleActionCopy = useCallback(() => {
    if (!lastResult) return
    const text = (lastResult.data?.fullDraft as string) ?? lastResult.output
    navigator.clipboard.writeText(text).catch(() => {})
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
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      <ParticleVisualizer state={voiceState} isActive={voiceState !== "idle"} audioLevel={audioLevel} />
      <div className="fixed inset-0 z-10" onClick={isAtLimit || billingLoading ? undefined : handleTap} data-testid="voice-tap-area"
        style={{ cursor: isAtLimit || billingLoading ? "default" : voiceState === "idle" || voiceState === "speaking" ? "pointer" : "default" }} />
      <nav className="relative z-20 flex items-center justify-between px-5 md:px-8 py-4 pointer-events-auto">
        <Link href="/" className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity" data-testid="home-link">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[11px] font-light hidden sm:inline tracking-wide">Home</span>
        </Link>
        <div className="flex items-center gap-2 opacity-40">
          <Image src="/images/logo-symbol.png" alt="missiAI" width={24} height={24}
            className="w-5 h-5 pointer-events-none" priority draggable={false} />
          <span className="text-[11px] font-medium tracking-wider">MISSI</span>
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
          <Link
            href="/pricing"
            onClick={(e) => e.stopPropagation()}
            data-testid="upgrade-to-pro-link"
            className="flex items-center gap-1 px-2 py-1 rounded-full transition-opacity hover:opacity-90"
            style={{
              background: plan?.id === 'free'
                ? 'rgba(255,255,255,0.08)'
                : 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(245,158,11,0.15))',
              border: plan?.id === 'free'
                ? '1px solid rgba(255,255,255,0.12)'
                : '1px solid rgba(124,58,237,0.3)',
              fontSize: 10,
              color: plan?.id === 'free' ? 'rgba(255,255,255,0.6)' : 'rgba(245,158,11,0.9)',
              fontWeight: 500,
              letterSpacing: '0.03em',
              textDecoration: 'none',
            }}
          >
            <Crown className="w-3 h-3" style={{ color: '#F59E0B' }} />
            {plan?.id === 'free' ? 'Upgrade to Pro' : plan?.id === 'pro' ? 'Pro Plan' : plan?.id === 'business' ? 'Business Plan' : 'Pricing'}
          </Link>
          <PluginBadge plugins={plugins} onManage={() => setShowSettings(true)} />
          <Link
            href="/memory"
            onClick={(e) => e.stopPropagation()}
            className="opacity-40 hover:opacity-70 transition-opacity"
            title="Memory Graph"
            style={{ display: 'flex', alignItems: 'center', color: 'white' }}
          >
            <Brain className="w-4 h-4" />
          </Link>
          <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings) }}
            className="opacity-40 hover:opacity-70 transition-opacity"
            data-testid="settings-toggle-btn"
            style={{ background: "none", border: "none", cursor: "pointer", color: "white" }}>
            {showSettings ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          </button>
        </div>
      </nav>
      <SettingsPanel personality={personality} onPersonalityChange={updatePersonality}
        voiceEnabled={voiceEnabled} onVoiceToggle={() => setVoiceEnabled((v) => !v)}
        isOpen={showSettings} onClose={() => setShowSettings(false)}
        userName={user?.fullName || "User"} userEmail={user?.primaryEmailAddress?.emailAddress || ""}
        userImageUrl={user?.imageUrl || null} onLogout={handleLogout}
        plugins={plugins}
        onConnectPlugin={connectPlugin}
        onDisconnectPlugin={disconnectPlugin}
      />
      <ConversationLog messages={conversationRef.current} isVisible={false} />

      {/* ── Action Card Overlay — above everything ─── */}
      {displayResult && (
        <div className="fixed bottom-32 md:bottom-36 left-0 right-0 z-50 flex justify-center pointer-events-none"
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

      <div className="fixed bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-10 md:pb-14 pointer-events-none"
        style={{ paddingBottom: plan?.id === 'free' ? 52 : undefined }}>
        <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
          <VoiceButton
            state={voiceState}
            onPress={handleTap}
            onRelease={() => {}}
            disabled={isAtLimit || billingLoading}
          />
        </div>
        <StatusDisplay
          state={voiceState}
          streamingText={streamingText}
          lastResponse={lastResponse}
          errorMessage={error}
          onDismissError={() => setError(null)}
          userName={user?.firstName || ""}
          statusText={statusText}
          lastTranscript={lastTranscript}
          briefing={briefing}
          nudges={nudges}
          onDismissItem={dismissItem}
          onBriefingDelivered={markDelivered}
          currentEmotion={currentEmotion}
        />
        <div className="mt-4">
          <p className="text-[9px] font-light tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.06)" }}>
            <span className="hidden md:inline">Space to talk &middot; Esc to cancel</span>
            <span className="md:hidden">Tap anywhere</span>
          </p>
        </div>
      </div>
      <UsageBar
        used={usage?.voiceInteractions ?? 0}
        limit={plan?.voiceInteractionsPerDay ?? 10}
        planId={plan?.id ?? 'free'}
        onUpgrade={() => initiateRazorpayCheckout('pro')}
      />
    </div>  )
}
