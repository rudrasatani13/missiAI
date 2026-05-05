"use client"

import { useCallback, useState } from "react"
import { useRouter } from "next/navigation"
import { useClerk } from "@clerk/nextjs"
import { ChatSidebar } from "@/components/chat/ChatSidebar"

/**
 * Floating rounded chrome used on every non-/chat page.
 *
 * Layout:
 *   [ ChatSidebar ] — [ rounded main card containing {children} ]
 *
 * Settings state (personality, voice toggle, custom prompt, user name) is now
 * edited on the dedicated /settings full-page and persisted via localStorage
 * through `useChatSettings`, so values are reflected across every surface
 * (sidebar rows, /chat live mode, /settings, etc.) on next render.
 *
 * The main card has `overflow-auto` with a styled scrollbar so long-form pages
 * can scroll internally without breaking the floating container.
 */
export function ChatShell({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { signOut } = useClerk()
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
      className="overflow-hidden select-none"
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
        onLogout={handleLogout}
        onNewChat={handleNewChat}
        isLiveMode={false}
        onWidthChange={setSidebarWidth}
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
          background: "var(--missi-surface)",
          border: "1px solid var(--missi-border)",
          boxShadow: "none",
        }}
      >
        {children}
      </main>

      {/* Scoped scrollbar styling for the shell main — mirrors the sidebar. */}
      <style>{`
        .missi-shell-main::-webkit-scrollbar { width: 8px; height: 8px; }
        .missi-shell-main::-webkit-scrollbar-track { background: transparent; }
        .missi-shell-main::-webkit-scrollbar-thumb {
          background: var(--missi-scrollbar);
          border-radius: 999px;
          transition: background 160ms ease;
        }
        .missi-shell-main:hover::-webkit-scrollbar-thumb { background: var(--missi-scrollbar-hover); }
        .missi-shell-main::-webkit-scrollbar-thumb:hover { background: var(--missi-scrollbar-hover); }
        .missi-shell-main { scrollbar-width: thin; scrollbar-color: var(--missi-scrollbar) transparent; scroll-behavior: smooth; }

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
