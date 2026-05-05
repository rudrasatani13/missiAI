"use client"

import { Suspense, lazy, useState, useEffect, type ChangeEventHandler, type RefObject } from "react"
import Link from "next/link"
import nextDynamic from "next/dynamic"
import { ArrowLeft, X } from "lucide-react"
import type { ActionResult } from "@/types/actions"
import type { PlanId } from "@/types/billing"
import type { VoiceState } from "@/types/chat"
import type { EmotionProfile } from "@/types/emotion"
import type { AvatarTier } from "@/types/gamification"
import type { PluginResult } from "@/types/plugins"
import type { BriefingItem, DailyBriefing } from "@/types/proactive"
import type { AgentStep } from "@/components/chat/AgentSteps"
import { VoiceButton } from "@/components/chat/VoiceButton"
import { StatusDisplay } from "@/components/chat/StatusDisplay"
import { ChatSidebar } from "@/components/chat/ChatSidebar"
import { UsageBar } from "@/components/chat/UsageBar"
import { BootSequence } from "@/components/chat/BootSequence"
import { ChatTextInput } from "@/components/chat/ChatTextInput"
import { useGuestChat } from "@/hooks/chat/useGuestChat"
import { GuestLimitModal } from "@/components/chat/GuestLimitModal"
import { Magnetic } from "@/components/effects/Magnetic"
import type { VisualMemoryResult } from "@/lib/chat/visual-memory"
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
  avatarTier?: AvatarTier
  billingLoading: boolean
  bootCompleted: boolean
  briefing: DailyBriefing | null
  clearVisualSelection: () => void
  completeBootSequence: () => void
  currentEmotion?: EmotionProfile | null
  dismissOnboarding: () => void
  dismissVisualResult: () => void
  displayName: string
  effectiveLastResponse: string
  effectiveLastTranscript: string
  effectiveStatusText: string
  effectiveVoiceState: VoiceState
  errorMessage: string | null
  fileInputRef: RefObject<HTMLInputElement | null>
  handleImageSelect: ChangeEventHandler<HTMLInputElement>
  handleSaveToMemory: () => void
  handleTap: () => void
  isAnalyzing: boolean
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
  setVisualNote: (value: string) => void
  showBootSequence: boolean
  showOnboarding: boolean
  streamingText: string
  thumbnail: string | null
  usedSeconds: number
  limitSeconds: number
  visualNote: string
  visualResult: VisualMemoryResult | null
  voiceState: VoiceState
}

export function ChatPageShell({
  isGuest = false,
  actionResult,
  agentSteps,
  audioLevel,
  avatarTier,
  billingLoading,
  bootCompleted,
  briefing,
  clearVisualSelection,
  completeBootSequence,
  currentEmotion,
  dismissOnboarding,
  dismissVisualResult,
  displayName,
  effectiveLastResponse,
  effectiveLastTranscript,
  effectiveStatusText,
  effectiveVoiceState,
  errorMessage,
  fileInputRef,
  handleImageSelect,
  handleSaveToMemory,
  handleTap,
  isAnalyzing,
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
  setVisualNote,
  showBootSequence,
  showOnboarding,
  streamingText,
  thumbnail,
  usedSeconds,
  limitSeconds,
  visualNote,
  visualResult,
  voiceState,
}: ChatPageShellProps) {
  // Sidebar width reported by ChatSidebar (0 on mobile). Used to offset fixed chat children.
  const [sidebarWidth, setSidebarWidth] = useState(240)

  // Guest chat state
  const guestChat = useGuestChat()
  const [showGuestLimitModal, setShowGuestLimitModal] = useState(false)

  useEffect(() => {
    if (guestChat.error === "GUEST_LIMIT_REACHED" || (isGuest && guestChat.isAtLimit)) {
      setShowGuestLimitModal(true)
      guestChat.clearError()
    }
  }, [guestChat.error, guestChat.isAtLimit, isGuest])

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
        onPickImage={() => fileInputRef.current?.click()}
        onWidthChange={setSidebarWidth}
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
      <ParticleVisualizer state={effectiveVoiceState} isActive={effectiveVoiceState !== "idle"} audioLevel={audioLevel} avatarTier={avatarTier} />
      <div className="absolute inset-0 z-10" onClick={isGuest || isAtLimit || billingLoading ? undefined : handleTap} data-testid="voice-tap-area"
        style={{ cursor: isGuest || isAtLimit || billingLoading ? "default" : voiceState === "idle" || voiceState === "speaking" ? "pointer" : "default" }} />
      {/* On mobile: offset from left to clear the fixed sidebar hamburger (48px).
          On desktop: 600px centered. */}
      <div className="relative w-auto md:w-[600px] ml-12 mr-3 md:mx-auto z-[100] pointer-events-none">
        <nav className="flex items-center justify-between w-full mt-12 md:mt-6 px-4 py-2.5 pointer-events-auto rounded-[32px] shadow-2xl"
          style={{
            background: "var(--missi-sidebar-bg)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid var(--missi-border-strong)",
            boxShadow: "0 4px 24px var(--missi-shadow)",
          }}>
          {/* Left: Back */}
          <div className="flex items-center flex-1 justify-start gap-2">
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
            <div className="flex items-center flex-1 justify-end gap-2">
              <Link
                href="/sign-in"
                className="flex items-center justify-center h-8 px-4 rounded-full text-[12px] font-medium transition-all active:scale-[0.97]"
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
                className="flex items-center justify-center h-8 px-5 rounded-full text-[12px] font-semibold transition-all active:scale-[0.97]"
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

        {/* Visual Memory Result Card — shown after successful analysis or on error */}
        {visualResult && (
          <div className="mb-3 pointer-events-auto w-72 rounded-2xl px-4 py-3 shadow-xl"
            style={{ background: 'rgba(0,255,140,0.07)', border: '1px solid rgba(0,255,140,0.15)', backdropFilter: 'blur(20px)' }}>
            <p className="text-[11px] font-medium mb-0.5" style={{ color: 'rgba(0,255,140,0.9)' }}>
              {visualResult.recallHint ? `Got it! I've saved this to your visual memory.` : visualResult.title}
            </p>
            {visualResult.recallHint && (
              <>
                <p className="text-[11px] font-light" style={{ color: 'var(--missi-text-secondary)' }}>
                  {visualResult.title} ✨
                </p>
                <p className="text-[10px] italic mt-1" style={{ color: 'var(--missi-text-muted)' }}>
                  Try asking: "{visualResult.recallHint}"
                </p>
                {visualResult.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {visualResult.tags.slice(0, 5).map((tag) => (
                      <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full"
                        style={{ background: 'var(--missi-surface)', color: 'var(--missi-text-secondary)', border: '1px solid var(--missi-border)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </>
            )}
            <button onClick={dismissVisualResult}
              className="absolute top-2 right-2 text-[var(--missi-text-muted)] hover:text-[var(--missi-text-secondary)] transition-colors"
              style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'absolute' }}>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Thumbnail Preview — shown when image is attached, before saving */}
        {thumbnail && !isAnalyzing && (
          <div className="mb-3 pointer-events-auto flex flex-col items-center gap-2">
            <div className="relative">
              <img src={thumbnail} alt="Upload preview" className="w-16 h-16 object-cover rounded-xl border border-[var(--missi-border)]" />
              <button onClick={(e) => {
                e.stopPropagation()
                clearVisualSelection()
              }}
                className="absolute -top-2 -right-2 bg-[var(--missi-bg)] text-[var(--missi-text-primary)] rounded-full p-0.5 border border-[var(--missi-border)] hover:scale-110 transition-transform">
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
                background: 'var(--missi-input-bg)',
                border: '1px solid var(--missi-input-border)',
                color: 'var(--missi-input-text)',
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
            <div className="w-4 h-4 rounded-full border-2 border-[var(--missi-border)] border-t-[var(--missi-text-secondary)]"
              style={{ animation: 'spin 0.8s linear infinite' }} />
            <p className="text-[11px] font-light" style={{ color: 'var(--missi-text-secondary)' }}>
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
