"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { MessageSquare, Plus, Sun, Moon, Sparkles, Brain, Zap } from "lucide-react"
import { useGuestChat } from "@/hooks/chat/useGuestChat"
import { ChatTextInput } from "@/components/chat/ChatTextInput"
import { GuestLimitModal } from "@/components/chat/GuestLimitModal"

const SUGGESTIONS = [
  { icon: <Sparkles className="w-3.5 h-3.5" />, text: "What can you help me with today?" },
  { icon: <Brain className="w-3.5 h-3.5" />, text: "Help me understand a complex topic" },
  { icon: <Zap className="w-3.5 h-3.5" />, text: "Give me a quick productivity tip" },
]

function MISSILogo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = size === "sm" ? { w: 56, h: 12 } : size === "lg" ? { w: 120, h: 28 } : { w: 80, h: 18 }
  return (
    <svg width={dims.w} height={dims.h} viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id={`led-guest-${size}`} width="3" height="2" patternUnits="userSpaceOnUse">
          <rect x="0.25" y="0.25" width="2.5" height="1.5" rx="0.4" fill="var(--missi-text-primary)" />
        </pattern>
        <mask id={`text-mask-guest-${size}`}>
          <rect width="100%" height="100%" fill="black" />
          <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
            fontSize="28" fontWeight="500" fontFamily="'VT323','Space Mono',monospace"
            fill="white" letterSpacing="5">MISSI</text>
        </mask>
      </defs>
      <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
        fontSize="28" fontWeight="500" fontFamily="'VT323','Space Mono',monospace"
        fill="var(--missi-text-primary)" opacity="0.12" style={{ filter: "blur(2px)" }} letterSpacing="5">MISSI</text>
      <rect width="100%" height="100%" fill={`url(#led-guest-${size})`} mask={`url(#text-mask-guest-${size})`} />
    </svg>
  )
}

export function GuestChatPage() {
  const {
    messages,
    streamingText,
    isStreaming,
    error,
    clearError,
    sendMessage,
    isAtLimit,
    remaining,
  } = useGuestChat()

  const [showLimitModal, setShowLimitModal] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof document !== "undefined") {
      setIsDark(document.documentElement.getAttribute("data-theme") === "dark")
    }
  }, [])

  const toggleTheme = () => {
    const root = document.documentElement
    const newTheme = isDark ? "light" : "dark"
    root.setAttribute("data-theme", newTheme)
    if (newTheme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    try {
      const stored = JSON.parse(localStorage.getItem("missi-appearance") ?? "{}")
      localStorage.setItem("missi-appearance", JSON.stringify({ ...stored, theme: newTheme }))
    } catch {}
    setIsDark(newTheme === "dark")
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingText])

  useEffect(() => {
    if (error === "GUEST_LIMIT_REACHED" || isAtLimit) {
      setShowLimitModal(true)
      clearError()
    }
  }, [error, isAtLimit, clearError])

  const handleSend = (text: string) => {
    if (isAtLimit) {
      setShowLimitModal(true)
      return
    }
    sendMessage(text)
  }

  const handleSuggestion = (text: string) => {
    if (isAtLimit) {
      setShowLimitModal(true)
      return
    }
    sendMessage(text)
  }

  const hasMessages = messages.length > 0 || isStreaming

  return (
    <div
      className="fixed inset-0 flex"
      style={{
        background: "var(--missi-bg)",
        fontFamily: "var(--font-body)",
      }}
    >
      {/* Hide global footer */}
      <style>{`[data-testid="global-footer"] { display: none !important; }`}</style>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside
        className="hidden md:flex flex-col flex-shrink-0"
        style={{
          width: 260,
          background: "var(--missi-sidebar-bg)",
          borderRight: "1px solid var(--missi-border)",
          height: "100%",
        }}
      >
        {/* Top: Logo + New Chat */}
        <div className="flex items-center justify-between h-14 px-4">
          <MISSILogo size="sm" />
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--missi-text-secondary)",
              cursor: "pointer",
            }}
            aria-label="New chat"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Nav: New chat */}
        <div className="px-3 py-2">
          <button
            type="button"
            className="flex items-center gap-3 w-full h-9 px-3 rounded-xl transition-colors"
            style={{
              background: "var(--missi-nav-active-bg)",
              border: "none",
              color: "var(--missi-nav-text-active)",
              cursor: "pointer",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <MessageSquare className="w-4 h-4 flex-shrink-0" />
            New chat
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom: Login prompt + theme toggle */}
        <div
          className="px-3 pb-4 pt-3"
          style={{ borderTop: "1px solid var(--missi-border)" }}
        >
          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-2.5 w-full h-9 px-3 rounded-xl transition-colors mb-2"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--missi-text-secondary)",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "var(--font-body)",
            }}
          >
            {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {isDark ? "Light mode" : "Dark mode"}
          </button>

          {/* ChatGPT-style login card */}
          <div
            className="rounded-xl p-3 mb-2"
            style={{
              background: "var(--missi-surface)",
              border: "1px solid var(--missi-border)",
            }}
          >
            <p
              className="text-[12px] font-semibold mb-0.5"
              style={{ color: "var(--missi-text-primary)" }}
            >
              Get responses tailored to you
            </p>
            <p
              className="text-[11px] mb-3 leading-relaxed"
              style={{ color: "var(--missi-text-secondary)" }}
            >
              Log in to save your chats, unlock memory, and use voice mode.
            </p>
            <Link
              href="/sign-in"
              className="flex items-center justify-center h-9 rounded-lg text-[13px] font-medium transition-all active:scale-[0.97] w-full"
              style={{
                background: "var(--missi-bg)",
                color: "var(--missi-text-primary)",
                border: "1px solid var(--missi-border-strong)",
                textDecoration: "none",
              }}
            >
              Log in
            </Link>
          </div>

          <Link
            href="/sign-up"
            className="flex items-center justify-center h-9 rounded-lg text-[13px] font-semibold transition-all active:scale-[0.97] w-full"
            style={{
              background: "var(--missi-text-primary)",
              color: "var(--missi-bg)",
              textDecoration: "none",
            }}
          >
            Sign up for free
          </Link>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <main className="relative flex-1 flex flex-col h-full overflow-hidden">
        {/* Mobile header */}
        <div
          className="flex md:hidden items-center justify-between h-12 px-4 flex-shrink-0"
          style={{ borderBottom: "1px solid var(--missi-border)" }}
        >
          <MISSILogo size="sm" />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="w-8 h-8 flex items-center justify-center rounded-lg"
              style={{ background: "transparent", border: "none", color: "var(--missi-text-secondary)", cursor: "pointer" }}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <Link
              href="/sign-in"
              className="flex items-center justify-center h-8 px-3 rounded-lg text-[12px] font-medium"
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
              className="flex items-center justify-center h-8 px-3 rounded-lg text-[12px] font-semibold"
              style={{
                background: "var(--missi-text-primary)",
                color: "var(--missi-bg)",
                textDecoration: "none",
              }}
            >
              Sign up
            </Link>
          </div>
        </div>

        {/* Messages or empty state */}
        <div className="flex-1 overflow-y-auto scrollbar-hide">
          {!hasMessages ? (
            /* Empty state — ChatGPT style */
            <div className="flex flex-col items-center justify-center h-full px-4 pb-32">
              <MISSILogo size="lg" />
              <h1
                className="mt-6 text-2xl font-semibold text-center"
                style={{ color: "var(--missi-text-primary)", fontFamily: "var(--font-display)" }}
              >
                What&apos;s on the agenda today?
              </h1>
              <p
                className="mt-2 text-sm text-center max-w-sm"
                style={{ color: "var(--missi-text-secondary)" }}
              >
                Ask me anything. No account needed to get started.
              </p>

              {/* Suggestion chips */}
              <div className="flex flex-col items-stretch gap-2 mt-8 w-full max-w-sm">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s.text}
                    type="button"
                    onClick={() => handleSuggestion(s.text)}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors"
                    style={{
                      background: "var(--missi-surface)",
                      border: "1px solid var(--missi-border)",
                      color: "var(--missi-text-secondary)",
                      cursor: "pointer",
                      fontSize: 13,
                      fontFamily: "var(--font-body)",
                    }}
                  >
                    <span style={{ color: "var(--missi-text-muted)", flexShrink: 0 }}>{s.icon}</span>
                    {s.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Message list */
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "assistant" && (
                    <div
                      className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-0.5"
                      style={{
                        background: "var(--missi-surface)",
                        border: "1px solid var(--missi-border)",
                        flexShrink: 0,
                      }}
                    >
                      <MISSILogo size="sm" />
                    </div>
                  )}
                  <div
                    className="max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                    style={{
                      background: msg.role === "user"
                        ? "var(--missi-text-primary)"
                        : "var(--missi-surface)",
                      color: msg.role === "user"
                        ? "var(--missi-bg)"
                        : "var(--missi-text-primary)",
                      border: msg.role === "user" ? "none" : "1px solid var(--missi-border)",
                      fontFamily: "var(--font-body)",
                      borderRadius: msg.role === "user"
                        ? "18px 18px 4px 18px"
                        : "18px 18px 18px 4px",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Streaming response */}
              {isStreaming && streamingText && (
                <div className="flex justify-start">
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-0.5"
                    style={{
                      background: "var(--missi-surface)",
                      border: "1px solid var(--missi-border)",
                    }}
                  >
                    <MISSILogo size="sm" />
                  </div>
                  <div
                    className="max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed"
                    style={{
                      background: "var(--missi-surface)",
                      color: "var(--missi-text-primary)",
                      border: "1px solid var(--missi-border)",
                      fontFamily: "var(--font-body)",
                      borderRadius: "18px 18px 18px 4px",
                    }}
                  >
                    {streamingText}
                    <span
                      className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
                      style={{ background: "var(--missi-text-primary)", borderRadius: 1 }}
                    />
                  </div>
                </div>
              )}

              {/* Streaming skeleton */}
              {isStreaming && !streamingText && (
                <div className="flex justify-start">
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-full mr-2 mt-0.5"
                    style={{ background: "var(--missi-surface)", border: "1px solid var(--missi-border)", borderRadius: "50%" }}
                  />
                  <div
                    className="px-4 py-2.5 rounded-2xl"
                    style={{
                      background: "var(--missi-surface)",
                      border: "1px solid var(--missi-border)",
                      borderRadius: "18px 18px 18px 4px",
                    }}
                  >
                    <div className="flex gap-1 items-center h-5">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{
                            background: "var(--missi-text-muted)",
                            animationDelay: `${i * 0.15}s`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div
          className="flex-shrink-0 px-4 pb-4 pt-2"
          style={{ borderTop: hasMessages ? "1px solid var(--missi-border)" : "none" }}
        >
          <div className="max-w-2xl mx-auto">
            <ChatTextInput
              onSend={handleSend}
              disabled={isStreaming}
              placeholder={isAtLimit ? "Sign up to keep chatting…" : "Message Missi…"}
              isGuest
              remaining={remaining}
            />
            <p
              className="text-center text-[11px] mt-2"
              style={{ color: "var(--missi-text-muted)" }}
            >
              By messaging Missi, you agree to our{" "}
              <Link href="/terms" style={{ color: "var(--missi-text-secondary)", textDecoration: "none" }}>
                Terms
              </Link>{" "}
              and have read our{" "}
              <Link href="/privacy" style={{ color: "var(--missi-text-secondary)", textDecoration: "none" }}>
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Guest limit modal */}
      {showLimitModal && (
        <GuestLimitModal onDismiss={() => setShowLimitModal(false)} />
      )}
    </div>
  )
}
