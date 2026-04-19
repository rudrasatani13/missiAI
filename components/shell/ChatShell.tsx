"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import { ChatSidebar } from "@/components/chat/ChatSidebar"
import { useBilling } from "@/hooks/useBilling"
import { useChatSettings } from "@/hooks/useChatSettings"

/**
 * Floating rounded chrome used on every non-/chat page (Memory, Mood, Streaks, etc.).
 *
 * Layout:
 *   [ ChatSidebar ] — [ rounded main card containing {children} ]
 *
 * The sidebar shares its settings state (personality, voice toggle, custom prompt,
 * user name) with the /chat page via localStorage through `useChatSettings`, so
 * toggling anything in one surface is instantly reflected in the other.
 *
 * The main card has `overflow-auto` with a styled scrollbar so long-form pages
 * can scroll internally without breaking the floating container.
 */
export function ChatShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { signOut } = useClerk()
  const { plan } = useBilling()
  const settings = useChatSettings()
  // Start at 0 so the very first client render on mobile doesn't briefly
  // allocate a 240px sidebar column (which would squish <main> into a
  // sliver since fixed-positioned grid items are ignored by auto-flow).
  // The ChatSidebar reports its real width via onWidthChange on mount.
  const [sidebarWidth, setSidebarWidth] = useState(0)

  const handleLogout = useCallback(() => {
    signOut().catch(() => {})
    setTimeout(() => {
      window.location.href = "/"
    }, 500)
  }, [signOut])

  const handleNewChat = useCallback(() => {
    try {
      sessionStorage.removeItem("missi-greeted")
    } catch {}
    router.push("/chat")
  }, [router])

  return (
    <div
      // Explicit CSS Grid instead of flex — removes all the flex-child sizing
      // ambiguity (implicit min-height: auto etc.) that was preventing the
      // main card from scrolling. Both the sidebar column and the main
      // column get their exact row height from the grid, so `overflow-y: auto`
      // on <main> simply works.
      className="bg-black text-white overflow-hidden select-none"
      style={{
        position: "fixed",
        inset: 0,
        display: "grid",
        // When sidebarWidth is 0 the ChatSidebar has switched to its mobile
        // drawer (position: fixed) — fixed/absolute grid items are ignored
        // by auto-placement, so if we still reserve a sidebar column here,
        // <main> auto-places into that 0px-wide column and the page renders
        // blank. Collapse to a single-column grid in that case.
        gridTemplateColumns:
          sidebarWidth === 0
            ? "minmax(0, 1fr)"
            : `${sidebarWidth}px minmax(0, 1fr)`,
        gridTemplateRows: "minmax(0, 1fr)",
        gap: "var(--shell-gap, 12px)",
        padding: "var(--shell-pad, 12px)",
        fontFamily: "var(--font-body)",
        ["--chat-sidebar-width" as never]: `${sidebarWidth}px`,
      }}
    >
      {/* Hide the global footer on shell pages */}
      <style>{`[data-testid="global-footer"] { display: none !important; }`}</style>

      <ChatSidebar
        plan={plan?.id}
        onLogout={handleLogout}
        onNewChat={handleNewChat}
        isLiveMode={false}
        activePersona={null}
        onPersonaChange={() => {
          /* Persona switching is handled on /chat. On other pages, selecting a
             persona persists via localStorage (through Settings sub-panel) and
             takes effect the next time the user visits /chat. */
        }}
        onSwitchToLive={() => {
          /* Live-mode toggle is meaningful only on /chat; here just navigate. */
          router.push("/chat")
        }}
        onPickImage={() => {
          /* No vision input outside /chat — route users there. */
          router.push("/chat")
        }}
        onWidthChange={setSidebarWidth}
        personality={settings.personality}
        onPersonalityChange={settings.setPersonality}
        voiceEnabled={settings.voiceEnabled}
        onVoiceToggle={settings.toggleVoice}
        customPrompt={settings.customPrompt}
        onCustomPromptChange={settings.setCustomPrompt}
        onNameChange={settings.setUserName}
      />

      {/*
        Grid-sized main column. `min-width: 0` lets long content wrap rather
        than force the grid column to widen. The grid's `minmax(0, 1fr)` row
        gives this cell a deterministic height, so `overflow-y: auto` actually
        produces a scrollbar when the content is taller.
      */}
      <main
        className="missi-shell-main relative rounded-2xl md:rounded-3xl"
        data-lenis-prevent
        style={{
          minWidth: 0,
          minHeight: 0,
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          background: "#0a0a0c",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow:
            "0 20px 60px -20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.02)",
        }}
      >
        {children}
      </main>

      {/* Scoped scrollbar styling for the shell main — mirrors the sidebar. */}
      <style>{`
        .missi-shell-main::-webkit-scrollbar { width: 8px; height: 8px; }
        .missi-shell-main::-webkit-scrollbar-track { background: transparent; }
        .missi-shell-main::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.06);
          border-radius: 999px;
          transition: background 160ms ease;
        }
        .missi-shell-main:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); }
        .missi-shell-main::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); }
        .missi-shell-main { scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent; scroll-behavior: smooth; }

        /* Mobile: reserve space at the top of the scroll area so page headers
           don't collide with the fixed hamburger button (36x36 at top:12/left:12).
           Applied via CSS var on the page-level child so existing inline paddings
           still work predictably. */
        @media (max-width: 767px) {
          .missi-shell-main > * { --missi-shell-top-safe: 44px; }
          .missi-shell-main { padding-top: 44px; }
        }
      `}</style>
    </div>
  )
}
