"use client"

import { Suspense, lazy, useState, useEffect } from "react"
import Link from "next/link"
import nextDynamic from "next/dynamic"
import { ArrowLeft, Menu } from "lucide-react"
import type { ActionResult } from "@/types/actions"
import type { PlanId } from "@/types/billing"
import type { VoiceState } from "@/types/chat"
import type { EmotionProfile } from "@/types/emotion"
import type { PluginResult } from "@/types/plugins"
import type { BriefingItem, DailyBriefing } from "@/types/proactive"
import type { AgentStep } from "@/components/chat/AgentSteps"
import { VoiceButton } from "@/components/chat/VoiceButton"
import { StatusDisplay } from "@/components/chat/StatusDisplay"
import { ChatSidebar } from "@/components/chat/ChatSidebar"
import { UsageBar } from "@/components/chat/UsageBar"
import { BootSequence } from "@/components/chat/BootSequence"
import { useGuestChat } from "@/hooks/chat/useGuestChat"
import { GuestLimitModal } from "@/components/chat/GuestLimitModal"
import { Magnetic } from "@/components/effects/Magnetic"
import { pluginResultToActionResult as mapPluginResultToActionResult } from "@/lib/chat/page-helpers"

// Dynamic import — keeps three.js OUT of the server/edge bundle (~5MB saved)
const ParticleVisualizer = nextDynamic(
  () => import("@/components/chat/ParticleVisualizer").then((m) => m.ParticleVisualizer),
  { ssr: false }
)

const ChatOptionalOverlays = lazy(() =>
  import("@/components/chat/ChatOptionalOverlays").then((module) => ({ default: module.ChatOptionalOverlays })),
)

/** Convert a PluginResult to an ActionResult shape for display in ActionCard. */
const pluginResultToActionResult = mapPluginResultToActionResult

interface ChatPageShellProps {
  isGuest?: boolean
  actionResult: ActionResult | null
  agentSteps: AgentStep[]
  audioLevel?: number
  billingLoading: boolean
  bootCompleted: boolean
  briefing: DailyBriefing | null
  completeBootSequence: () => void
  currentEmotion?: EmotionProfile | null
  dismissOnboarding: () => void
  displayName: string
  effectiveLastResponse: string
  effectiveLastTranscript: string
  effectiveStatusText: string
  effectiveVoiceState: VoiceState
  errorMessage: string | null
  handleTap: () => void
  isAtLimit: boolean
  lastResult: ActionResult | null
  liveMode: boolean
  markDelivered: () => void
  nudges: BriefingItem[]
  onActionCopy: () => void
  onDismissDisplay: () => void
  onDismissError: () => void
  onDismissItem: (item: BriefingItem) => void
  onLogout: () => void
  onNewChat: () => void
  onUpgrade: () => void
  planId: PlanId | undefined
  pluginResult: PluginResult | null
  showBootSequence: boolean
  showOnboarding: boolean
  streamingText: string
  usedSeconds: number
  limitSeconds: number
  voiceState: VoiceState
}

export function ChatPageShell({
  isGuest = false,
  actionResult,
  agentSteps,
  audioLevel,
  billingLoading,
  bootCompleted,
  briefing,
  completeBootSequence,
  currentEmotion,
  dismissOnboarding,
  displayName,
  effectiveLastResponse,
  effectiveLastTranscript,
  effectiveStatusText,
  effectiveVoiceState,
  errorMessage,
  handleTap,
  isAtLimit,
  lastResult,
  liveMode,
  markDelivered,
  nudges,
  onActionCopy,
  onDismissDisplay,
  onDismissError,
  onDismissItem,
  onLogout,
  onNewChat,
  onUpgrade,
  planId,
  pluginResult,
  showBootSequence,
  showOnboarding,
  streamingText,
  usedSeconds,
  limitSeconds,
  voiceState,
}: ChatPageShellProps) {
  // Sidebar width reported by ChatSidebar (0 on mobile). Used to offset fixed chat children.
  const [sidebarWidth, setSidebarWidth] = useState(240)
  // Mobile sidebar open state — lifted here so we can render the trigger inside the MISSI pill.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Guest chat state
  const guestChat = useGuestChat()
  const { error: guestChatError, isAtLimit: guestIsAtLimit, clearError: clearGuestChatError } = guestChat
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false)

  useEffect(() => {
    if (guestChatError === "GUEST_LIMIT_REACHED" || (isGuest && guestIsAtLimit)) {
      setShowGuestLimitModal(true)
      clearGuestChatError()
    }
  }, [clearGuestChatError, guestChatError, guestIsAtLimit, isGuest])

  // Determine what to show in ActionCard: prefer plugin result if present, else action result
  const displayResult = pluginResult
    ? pluginResultToActionResult(pluginResult)
    : actionResult

  return (
    <div className="fixed inset-0 flex gap-2 md:gap-3 p-2 md:p-3 overflow-hidden select-none"
      style={{ background: "var(--missi-bg)", color: "var(--missi-text-primary)", fontFamily: "var(--font-body)", ['--chat-sidebar-width' as any]: `${sidebarWidth}px` }}>
      {/* Hide global footer on chat page */}
      <style>{`[data-testid="global-footer"] { display: none !important; }`}</style>

      <ChatSidebar
        plan={planId}
        onLogout={onLogout}
        onNewChat={onNewChat}
        isLiveMode={liveMode}
        isGuest={isGuest}
        onWidthChange={setSidebarWidth}
        mobileSidebarOpen={mobileSidebarOpen}
        onMobileSidebarChange={setMobileSidebarOpen}
      />

      <main
        className="relative flex-1 min-w-0 h-full overflow-hidden rounded-2xl md:rounded-3xl"
        style={{
          background: "var(--missi-chat-main-bg)",
          border: "1px solid var(--missi-chat-main-border)",
          boxShadow: "0 20px 60px -20px var(--missi-shadow-lg)",
        }}
      >

      {showBootSequence && !bootCompleted && (
        <BootSequence
          userName={displayName || "Guest"}
          onComplete={completeBootSequence}
        />
      )}
      <Suspense fallback={null}>
        <ChatOptionalOverlays
          actionCopyEnabled={
            !pluginResult && (lastResult?.type === "draft_email" || lastResult?.type === "draft_message")
          }
          agentSteps={agentSteps}
          dismissOnboarding={dismissOnboarding}
          displayResult={displayResult}
          onActionCopy={onActionCopy}
          onDismissDisplay={onDismissDisplay}
          showOnboarding={showOnboarding}
        />
      </Suspense>
      <ParticleVisualizer state={effectiveVoiceState} isActive={effectiveVoiceState !== "idle"} audioLevel={audioLevel} />
      <div className="absolute inset-0 z-10" onClick={isGuest || isAtLimit || billingLoading ? undefined : handleTap} data-testid="voice-tap-area"
        style={{ cursor: isGuest || isAtLimit || billingLoading ? "default" : voiceState === "idle" || voiceState === "speaking" ? "pointer" : "default" }} />
      {/* On mobile: full-width pill with hamburger on the left.
          On desktop: 600px centered. */}
      <div className="relative w-auto md:w-[600px] mx-3 md:mx-auto z-[100] pointer-events-none">
        <nav className="flex items-center justify-between w-full mt-4 md:mt-6 px-3 md:px-4 py-2 md:py-2.5 pointer-events-auto rounded-[32px] shadow-2xl"
          style={{
            background: "var(--missi-sidebar-bg)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid var(--missi-border-strong)",
            boxShadow: "0 4px 24px var(--missi-shadow)",
          }}>
          {/* Left: hamburger on mobile, back-arrow on desktop */}
          <div className="flex items-center flex-1 justify-start gap-1">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sidebar"
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-full transition-colors focus-visible:outline-none"
              style={{ background: "transparent", border: "1px solid var(--missi-border)", color: "var(--missi-text-secondary)", cursor: "pointer" }}
            >
              <Menu className="w-4 h-4" />
            </button>
            <Magnetic>
              <Link href="/chat" className="hidden md:flex items-center justify-center p-2 rounded-full transition-all" style={{ color: "var(--missi-text-secondary)", opacity: 0.7 }} data-testid="home-link">
                <ArrowLeft className="w-4 h-4" />
              </Link>
            </Magnetic>
          </div>

          {/* Center: MISSI */}
          <div className="flex justify-center select-none flex-none">
            <svg width="90" height="20" viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="led-nav" width="3" height="2" patternUnits="userSpaceOnUse">
                  <rect x="0.25" y="0.25" width="2.5" height="1.5" rx="0.4" fill="var(--missi-text-primary)" />
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
                fill="var(--missi-text-primary)" opacity="0.15" style={{ filter: 'blur(4px)' }} letterSpacing="5">MISSI</text>
              <rect width="100%" height="100%" fill="url(#led-nav)" mask="url(#text-mask-nav)" />
            </svg>
          </div>

          {/* Right: Login/Signup for guests, empty spacer for auth users */}
          {isGuest ? (
            <div className="flex items-center flex-1 justify-end gap-1.5">
              <Link
                href="/sign-in"
                className="flex items-center justify-center h-8 px-3 rounded-full text-[12px] font-medium transition-all active:scale-[0.97] whitespace-nowrap"
                style={{
                  background: "transparent",
                  border: "1px solid var(--missi-border-strong)",
                  color: "var(--missi-text-primary)",
                  textDecoration: "none",
                }}
              >
                Log in
              </Link>
              <Link
                href="/sign-up"
                className="flex items-center justify-center h-8 px-3 rounded-full text-[12px] font-semibold transition-all active:scale-[0.97] whitespace-nowrap"
                style={{
                  background: "var(--missi-text-primary)",
                  color: "var(--missi-bg)",
                  textDecoration: "none",
                }}
              >
                Sign up
              </Link>
            </div>
          ) : (
            <div className="flex items-center flex-1 justify-end" aria-hidden />
          )}
        </nav>
      </div>

      {/* ── Main Voice Controls Dock ─── */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center pointer-events-none"
        style={{
          paddingBottom: planId === 'free'
            ? 'calc(52px + env(safe-area-inset-bottom))'
            : 'calc(2.5rem + env(safe-area-inset-bottom))',
        }}>

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
          errorMessage={errorMessage}
          onDismissError={onDismissError}
          userName={displayName}
          statusText={effectiveStatusText}
          lastTranscript={effectiveLastTranscript}
          briefing={briefing}
          nudges={nudges}
          onDismissItem={onDismissItem}
          onBriefingDelivered={markDelivered}
          currentEmotion={currentEmotion}
          isLiveMode={liveMode}
        />
        <div className="mt-4 pointer-events-auto">
          <p className="text-[10px] font-medium tracking-widest uppercase" style={{ color: "var(--missi-text-muted)" }}>
            <span className="hidden md:inline">Space to talk &middot; Esc to cancel</span>
            <span className="md:hidden">Tap anywhere</span>
          </p>
        </div>

      </div>

      <UsageBar
        usedSeconds={usedSeconds}
        limitSeconds={limitSeconds}
        planId={planId ?? 'free'}
        onUpgrade={onUpgrade}
      />

      </main>

      {isGuest && showGuestLimitModal && (
        <GuestLimitModal onDismiss={() => setShowGuestLimitModal(false)} />
      )}

      {/* Guest messages overlay */}
      {isGuest && (guestChat.messages.length > 0 || guestChat.isStreaming) && (
        <div
          className="fixed inset-0 z-[15] pointer-events-none overflow-y-auto scrollbar-hide"
          style={{ paddingTop: 80, paddingBottom: 200 }}
        >
          <div className="max-w-2xl mx-auto px-4 space-y-3">
            {guestChat.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed pointer-events-auto"
                  style={{
                    background: msg.role === "user" ? "var(--missi-text-primary)" : "var(--missi-surface)",
                    color: msg.role === "user" ? "var(--missi-bg)" : "var(--missi-text-primary)",
                    backdropFilter: msg.role === "assistant" ? "blur(12px)" : undefined,
                    border: msg.role === "assistant" ? "1px solid var(--missi-border)" : "none",
                    borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {guestChat.isStreaming && guestChat.streamingText && (
              <div className="flex justify-start">
                <div
                  className="max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed pointer-events-auto"
                  style={{
                    background: "var(--missi-surface)",
                    color: "var(--missi-text-primary)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid var(--missi-border)",
                    borderRadius: "18px 18px 18px 4px",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {guestChat.streamingText}
                  <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: "var(--missi-text-secondary)", borderRadius: 1 }} />
                </div>
              </div>
            )}
            {guestChat.isStreaming && !guestChat.streamingText && (
              <div className="flex justify-start">
                <div className="px-4 py-3 rounded-2xl pointer-events-auto" style={{ background: "var(--missi-surface)", backdropFilter: "blur(12px)", border: "1px solid var(--missi-border)", borderRadius: "18px 18px 18px 4px" }}>
                  <div className="flex gap-1 items-center h-4">
                    {[0,1,2].map((i) => <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--missi-text-secondary)", animationDelay: `${i * 0.15}s` }} />)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
