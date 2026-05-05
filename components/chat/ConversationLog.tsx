"use client"

import { memo, useRef, useEffect } from "react"
import type { ConversationEntry } from "@/types/chat"

interface ConversationLogProps {
  messages: ConversationEntry[]
  isVisible: boolean
}

function formatRelativeTime(timestamp?: number): string {
  if (!timestamp) return ""
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 10) return "just now"
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function ConversationLogInner({ messages, isVisible }: ConversationLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isVisible && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length, isVisible])

  if (!isVisible) return null

  const visibleMessages = messages.length > 20 ? messages.slice(-20) : messages

  return (
    <div
      className="fixed top-16 left-5 z-30 w-80 max-h-[60vh] rounded-2xl p-4 pointer-events-auto"
      data-testid="conversation-log"
      style={{
        background: "rgba(0,0,0,0.7)",
        border: "1px solid var(--missi-border)",
        backdropFilter: "blur(30px)",
        animation: "slideDown 0.25s ease-out both",
      }}
    >
      <p
        className="text-[10px] font-medium tracking-wider uppercase mb-3"
        style={{ color: "var(--missi-text-muted)" }}
      >
        Conversation
      </p>
      <div
        ref={scrollRef}
        className="flex flex-col gap-3 overflow-y-auto pr-1"
        data-testid="conversation-messages"
        style={{ maxHeight: "calc(60vh - 80px)" }}
      >
        {visibleMessages.length === 0 && (
          <p
            className="text-[11px] font-light text-center"
            style={{ color: "var(--missi-text-muted)" }}
          >
            No messages yet
          </p>
        )}
        {visibleMessages.map((msg, i) => (
          <div
            key={i}
            data-testid={`message-${msg.role}-${i}`}
            className={`flex flex-col gap-0.5 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <span
              className="text-[9px] font-light"
              style={{ color: "var(--missi-text-muted)" }}
            >
              {msg.role === "user" ? "You" : "Missi"}
              {msg.timestamp ? ` \u00B7 ${formatRelativeTime(msg.timestamp)}` : ""}
            </span>
            <div
              className="max-w-[90%] rounded-xl px-3 py-2"
              style={{
                background:
                  msg.role === "user"
                    ? "var(--missi-text-muted)"
                    : "rgba(0,255,140,0.06)",
                border: `1px solid ${
                  msg.role === "user"
                    ? "var(--missi-text-muted)"
                    : "rgba(0,255,140,0.1)"
                }`,
              }}
            >
              <p
                className="text-[11px] font-light leading-relaxed"
                style={{ color: "var(--missi-text-secondary)" }}
              >
                {msg.content}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function areEqual(prev: ConversationLogProps, next: ConversationLogProps): boolean {
  return prev.messages.length === next.messages.length && prev.isVisible === next.isVisible
}

export const ConversationLog = memo(ConversationLogInner, areEqual)
