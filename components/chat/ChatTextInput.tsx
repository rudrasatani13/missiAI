"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp, Paperclip, Mic } from "lucide-react"

interface ChatTextInputProps {
  onSend: (text: string) => void
  disabled?: boolean
  placeholder?: string
  showVoiceButton?: boolean
  onVoiceClick?: () => void
  onAttachClick?: () => void
  isGuest?: boolean
  remaining?: number
}

export function ChatTextInput({
  onSend,
  disabled = false,
  placeholder = "Message Missi…",
  showVoiceButton = false,
  onVoiceClick,
  onAttachClick,
  isGuest = false,
  remaining,
}: ChatTextInputProps) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto"
    }
  }, [value, disabled, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px"
  }, [value])

  const canSend = value.trim().length > 0 && !disabled

  return (
    <div
      className="relative flex flex-col w-full"
      style={{
        background: "var(--missi-input-bg)",
        border: "1px solid var(--missi-input-border)",
        borderRadius: 16,
        boxShadow: "0 2px 12px var(--missi-shadow)",
        padding: "8px 8px 8px 12px",
      }}
    >
      {/* Guest remaining count badge */}
      {isGuest && typeof remaining === "number" && remaining <= 3 && remaining > 0 && (
        <div
          className="absolute -top-8 right-0 text-[11px] font-medium px-2 py-1 rounded-lg"
          style={{
            background: "var(--missi-surface)",
            color: remaining <= 1 ? "#ef4444" : "var(--missi-text-secondary)",
            border: "1px solid var(--missi-border)",
          }}
        >
          {remaining} message{remaining !== 1 ? "s" : ""} left
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attach button */}
        {onAttachClick && (
          <button
            type="button"
            onClick={onAttachClick}
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--missi-text-secondary)",
              cursor: "pointer",
            }}
            aria-label="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        )}

        {/* Text area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className="flex-1 resize-none outline-none bg-transparent"
          style={{
            color: "var(--missi-input-text)",
            fontSize: 15,
            lineHeight: "1.5",
            fontFamily: "var(--font-body)",
            minHeight: 36,
            maxHeight: 200,
            scrollbarWidth: "none",
          }}
        />

        {/* Voice button (auth users only) */}
        {showVoiceButton && onVoiceClick && (
          <button
            type="button"
            onClick={onVoiceClick}
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--missi-text-secondary)",
              cursor: "pointer",
            }}
            aria-label="Switch to voice"
          >
            <Mic className="w-4 h-4" />
          </button>
        )}

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={!canSend}
          className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg transition-all"
          style={{
            background: canSend ? "var(--missi-text-primary)" : "var(--missi-border)",
            border: "none",
            color: canSend ? "var(--missi-bg)" : "var(--missi-text-muted)",
            cursor: canSend ? "pointer" : "not-allowed",
            transform: canSend ? "scale(1)" : "scale(0.95)",
            transition: "all 0.15s ease",
          }}
          aria-label="Send message"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
