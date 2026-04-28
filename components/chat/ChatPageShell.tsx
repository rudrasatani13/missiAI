"use client"

import { useState, type ChangeEventHandler, type RefObject } from "react"
import Link from "next/link"
import nextDynamic from "next/dynamic"
import { ArrowLeft, X } from "lucide-react"
import type { ActionResult } from "@/types/actions"
import type { PlanId } from "@/types/billing"
import type { ConversationEntry, VoiceState } from "@/types/chat"
import type { EmotionProfile } from "@/types/emotion"
import type { AvatarTier } from "@/types/gamification"
import type { PluginResult } from "@/types/plugins"
import type { BriefingItem, DailyBriefing } from "@/types/proactive"
import { VoiceButton } from "@/components/chat/VoiceButton"
import { StatusDisplay } from "@/components/chat/StatusDisplay"
import { ChatSidebar } from "@/components/chat/ChatSidebar"
import { ConversationLog } from "@/components/chat/ConversationLog"
import { ActionCard } from "@/components/chat/ActionCard"
import { UsageBar } from "@/components/chat/UsageBar"
import { BootSequence } from "@/components/chat/BootSequence"
import { AgentSteps, type AgentStep } from "@/components/chat/AgentSteps"
import { OnboardingTour } from "@/components/chat/OnboardingTour"
import { Magnetic } from "@/components/effects/Magnetic"
import { DailyBriefBanner } from "@/components/chat/DailyBriefBanner"
import type { VisualMemoryResult } from "@/lib/chat/visual-memory"
import { pluginResultToActionResult as mapPluginResultToActionResult } from "@/lib/chat/page-helpers"

// Dynamic import — keeps three.js OUT of the server/edge bundle (~5MB saved)
const ParticleVisualizer = nextDynamic(
  () => import("@/components/chat/ParticleVisualizer").then((m) => m.ParticleVisualizer),
  { ssr: false }
)

/** Convert a PluginResult to an ActionResult shape for display in ActionCard. */
const pluginResultToActionResult = mapPluginResultToActionResult

interface ChatPageShellProps {
  actionResult: ActionResult | null
  agentSteps: AgentStep[]
  audioLevel?: number
  avatarTier?: AvatarTier
  billingLoading: boolean
  bootCompleted: boolean
  briefing: DailyBriefing | null
  clearVisualSelection: () => void
  completeBootSequence: () => void
  conversation: ConversationEntry[]
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
  actionResult,
  agentSteps,
  audioLevel,
  avatarTier,
  billingLoading,
  bootCompleted,
  briefing,
  clearVisualSelection,
  completeBootSequence,
  conversation,
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

  // Determine what to show in ActionCard: prefer plugin result if present, else action result
  const displayResult = pluginResult
    ? pluginResultToActionResult(pluginResult)
    : actionResult

  return (
    <div className="fixed inset-0 flex gap-2 md:gap-3 p-2 md:p-3 bg-black text-white overflow-hidden select-none"
      style={{ fontFamily: "var(--font-body)", ['--chat-sidebar-width' as any]: `${sidebarWidth}px` }}>
      {/* Hide global footer on chat page */}
      <style>{`[data-testid="global-footer"] { display: none !important; }`}</style>

      <ChatSidebar
        plan={planId}
        onLogout={onLogout}
        onNewChat={onNewChat}
        isLiveMode={liveMode}
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
          onComplete={completeBootSequence}
        />
      )}
      {showOnboarding && (
        <OnboardingTour onComplete={dismissOnboarding} />
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




      <ConversationLog messages={conversation} isVisible={false} />

      {/* ── Action Card Overlay — above everything ─── */}
      {displayResult && (
        <div className="absolute bottom-32 md:bottom-36 left-0 right-0 z-50 flex justify-center pointer-events-none"
          data-testid="action-card-container">
          <ActionCard
            result={displayResult}
            onDismiss={onDismissDisplay}
            onCopy={
              !pluginResult && (lastResult?.type === "draft_email" || lastResult?.type === "draft_message")
                ? onActionCopy
                : undefined
            }
          />
        </div>
      )}

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
            <button onClick={dismissVisualResult}
              aria-label="Dismiss visual result"
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
                clearVisualSelection()
              }}
                aria-label="Clear image selection"
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
    </div>
  )
}
