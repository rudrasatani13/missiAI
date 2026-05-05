"use client"

import { useCallback, useRef, useState } from "react"

export interface GuestMessage {
  role: "user" | "assistant"
  content: string
  id: string
}

const GUEST_MAX_MESSAGES = 5
const SESSION_KEY = "missi_guest_msg_count"

function getGuestCount(): number {
  try {
    return parseInt(sessionStorage.getItem(SESSION_KEY) ?? "0", 10) || 0
  } catch {
    return 0
  }
}

function setGuestCount(n: number) {
  try {
    sessionStorage.setItem(SESSION_KEY, String(n))
  } catch {}
}

export function useGuestChat() {
  const [messages, setMessages] = useState<GuestMessage[]>([])
  const [streamingText, setStreamingText] = useState("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestCount, setGuestCountState] = useState(getGuestCount)
  const abortRef = useRef<AbortController | null>(null)

  const isAtLimit = guestCount >= GUEST_MAX_MESSAGES
  const remaining = Math.max(0, GUEST_MAX_MESSAGES - guestCount)

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming || isAtLimit) return

      const userMsg: GuestMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text.trim(),
      }

      setMessages((prev) => [...prev, userMsg])
      setStreamingText("")
      setIsStreaming(true)
      setError(null)

      const history: GuestMessage[] = [...messages, userMsg]

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch("/api/v1/guest-chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: history.map((m) => ({ role: m.role, content: m.content })),
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const data = await res.json().catch(() => null) as { error?: string; message?: string } | null
          if (data?.error === "GUEST_LIMIT_REACHED") {
            const newCount = GUEST_MAX_MESSAGES
            setGuestCountState(newCount)
            setGuestCount(newCount)
            setError("GUEST_LIMIT_REACHED")
          } else {
            setError(data?.message ?? "Something went wrong. Please try again.")
          }
          setIsStreaming(false)
          return
        }

        const newCount = guestCount + 1
        setGuestCountState(newCount)
        setGuestCount(newCount)

        if (!res.body) {
          setIsStreaming(false)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""
        let accumulated = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || !trimmed.startsWith("data:")) continue
            const dataStr = trimmed.slice(5).trim()
            if (dataStr === "[DONE]") continue

            try {
              const parsed = JSON.parse(dataStr) as { text?: string; remaining?: number }
              if (typeof parsed.text === "string") {
                accumulated += parsed.text
                setStreamingText(accumulated)
              }
            } catch {}
          }
        }

        if (accumulated.trim()) {
          const assistantMsg: GuestMessage = {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: accumulated.trim(),
          }
          setMessages((prev) => [...prev, assistantMsg])
        }

        setStreamingText("")
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return
        console.error("[useGuestChat] error:", err)
        setError("Connection error. Please try again.")
      } finally {
        setIsStreaming(false)
      }
    },
    [messages, isStreaming, isAtLimit, guestCount],
  )

  const clearError = useCallback(() => setError(null), [])

  return {
    messages,
    streamingText,
    isStreaming,
    error,
    clearError,
    sendMessage,
    isAtLimit,
    remaining,
    guestCount,
  }
}
