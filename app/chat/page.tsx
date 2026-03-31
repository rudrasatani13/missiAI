"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Settings, X } from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"
import { useVoiceStateMachine } from "@/hooks/useVoiceStateMachine"
import { PERSONALITY_OPTIONS, type PersonalityKey, type ConversationEntry } from "@/types/chat"
import { ParticleVisualizer } from "@/components/chat/ParticleVisualizer"
import { VoiceButton } from "@/components/chat/VoiceButton"
import { StatusDisplay } from "@/components/chat/StatusDisplay"
import { SettingsPanel } from "@/components/chat/SettingsPanel"
import { ConversationLog } from "@/components/chat/ConversationLog"

export const runtime = "edge"
export const dynamic = "force-dynamic"

export default function VoiceAssistantPage() {
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()
  const [showSettings, setShowSettings] = useState(false)
  const [personality, setPersonality] = useState<PersonalityKey>("bestfriend")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const personalityRef = useRef<PersonalityKey>("bestfriend")
  const memoriesRef = useRef("")
  const conversationRef = useRef<ConversationEntry[]>([])
  const greetedRef = useRef(false)

  const {
    state: voiceState, audioLevel, statusText, lastTranscript,
    error, setError, streamingText, lastResponse, handleTap, cancelAll, greet, saveMemoryBeacon,
  } = useVoiceStateMachine({ userId: user?.id, personalityRef, memoriesRef, conversationRef })

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
    if (e.code === "Space" && e.target === document.body) { e.preventDefault(); handleTap() }
    if (e.code === "Escape") cancelAll() }
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h)
  }, [handleTap, cancelAll])
  useEffect(() => () => { cancelAll() }, [cancelAll])
  useEffect(() => { const bu = () => saveMemoryBeacon()
    const vc = () => { if (document.visibilityState === "hidden") saveMemoryBeacon() }
    window.addEventListener("beforeunload", bu); document.addEventListener("visibilitychange", vc)
    return () => { window.removeEventListener("beforeunload", bu); document.removeEventListener("visibilitychange", vc) }
  }, [saveMemoryBeacon])

  useEffect(() => { if (!isLoaded || greetedRef.current) return; greetedRef.current = true
    const n = user?.firstName || "", gs = [`Hey${n ? ` ${n}` : ""}! What's up, how's it going?`,
      `Hey${n ? ` ${n}` : ""}! Good to see you, what can I help with?`, `Hey${n ? ` ${n}` : ""}! How are you doing today?`]
    setTimeout(() => greet(gs[Math.floor(Math.random() * gs.length)]), 1200)
  }, [isLoaded, user, greet])

  const handleLogout = useCallback(() => { cancelAll(); setShowSettings(false)
    signOut().catch(() => {}); setTimeout(() => { window.location.href = "/" }, 500)
  }, [signOut, cancelAll])

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
      <ParticleVisualizer state={voiceState} isActive={voiceState !== "idle"} audioLevel={audioLevel} />
      <div className="fixed inset-0 z-10" onClick={handleTap} data-testid="voice-tap-area"
        style={{ cursor: voiceState === "idle" || voiceState === "speaking" ? "pointer" : "default" }} />
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
        <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings) }}
          className="opacity-40 hover:opacity-70 transition-opacity pointer-events-auto"
          data-testid="settings-toggle-btn"
          style={{ background: "none", border: "none", cursor: "pointer", color: "white" }}>
          {showSettings ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
        </button>
      </nav>
      <SettingsPanel personality={personality} onPersonalityChange={updatePersonality}
        voiceEnabled={voiceEnabled} onVoiceToggle={() => setVoiceEnabled((v) => !v)}
        isOpen={showSettings} onClose={() => setShowSettings(false)}
        userName={user?.fullName || "User"} userEmail={user?.primaryEmailAddress?.emailAddress || ""}
        userImageUrl={user?.imageUrl || null} onLogout={handleLogout} />
      <ConversationLog messages={conversationRef.current} isVisible={false} />
      <div className="fixed bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-10 md:pb-14 pointer-events-none">
        <VoiceButton state={voiceState} onPress={handleTap} onRelease={() => {}} disabled={false} />
        <StatusDisplay state={voiceState} streamingText={streamingText} lastResponse={lastResponse} errorMessage={error}
          onDismissError={() => setError(null)} userName={user?.firstName || ""}
          statusText={statusText} lastTranscript={lastTranscript} />
        <div className="mt-4">
          <p className="text-[9px] font-light tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.06)" }}>
            <span className="hidden md:inline">Space to talk &middot; Esc to cancel</span>
            <span className="md:hidden">Tap anywhere</span>
          </p>
        </div>
      </div>
    </div>
  )
}
