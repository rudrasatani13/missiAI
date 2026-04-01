"use client"

import { useEffect, useRef, useCallback } from "react"
import {
  Search,
  Mail,
  MessageSquare,
  Bell,
  FileText,
  Calculator,
  Languages,
  AlignLeft,
  X,
  Copy,
  Check,
} from "lucide-react"
import { useState } from "react"
import type { ActionResult } from "@/types/actions"
import { getActionLabel } from "@/lib/actions/action-registry"

interface ActionCardProps {
  result: ActionResult
  onDismiss: () => void
  onCopy?: () => void
}

const ACTION_ICONS = {
  web_search: Search,
  draft_email: Mail,
  draft_message: MessageSquare,
  set_reminder: Bell,
  take_note: FileText,
  calculate: Calculator,
  translate: Languages,
  summarize: AlignLeft,
  none: Search,
} as const

const ACTION_COLORS = {
  web_search: "#60a5fa",
  draft_email: "#f472b6",
  draft_message: "#34d399",
  set_reminder: "#fbbf24",
  take_note: "#a78bfa",
  calculate: "#fb923c",
  translate: "#2dd4bf",
  summarize: "#818cf8",
  none: "#9ca3af",
} as const

export function ActionCard({ result, onDismiss, onCopy }: ActionCardProps) {
  const [copied, setCopied] = useState(false)
  const [visible, setVisible] = useState(false)
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Entrance animation
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 20)
    return () => clearTimeout(t)
  }, [])

  // Auto-dismiss after 8s
  useEffect(() => {
    autoDismissRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, 8000)
    return () => {
      if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    }
  }, [onDismiss])

  const handleDismiss = useCallback(() => {
    if (autoDismissRef.current) clearTimeout(autoDismissRef.current)
    setVisible(false)
    setTimeout(onDismiss, 300)
  }, [onDismiss])

  const handleCopy = useCallback(() => {
    if (onCopy) onCopy()
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [onCopy])

  const Icon = ACTION_ICONS[result.type] ?? Search
  const color = ACTION_COLORS[result.type] ?? "#9ca3af"
  const label = getActionLabel(result.type)
  const showCopyBtn =
    (result.type === "draft_email" || result.type === "draft_message") && onCopy
  const isLongContent = result.type === "draft_email" || result.type === "draft_message"
  const previewLimit = isLongContent ? 200 : 100
  const displayOutput =
    result.output.length > previewLimit ? result.output.slice(0, previewLimit) + "..." : result.output

  return (
    <div
      data-testid="action-card"
      role="status"
      aria-label={`Action result: ${label}`}
      style={{
        transform: visible
          ? "translateY(0px)"
          : "translateY(20px)",
        opacity: visible ? 1 : 0,
        transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        borderRadius: "14px",
        padding: "12px 16px",
        minWidth: "280px",
        maxWidth: "380px",
        width: "max-content",
        pointerEvents: "auto",
      }}
    >
      {/* Header Row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "8px",
        }}
      >
        <div
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "8px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: `${color}18`,
            flexShrink: 0,
          }}
        >
          <Icon size={14} style={{ color }} />
        </div>
        <span
          data-testid="action-card-label"
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color,
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            flex: 1,
          }}
        >
          {label}
        </span>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {showCopyBtn && (
            <button
              data-testid="action-card-copy-btn"
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "6px",
                padding: "4px 8px",
                cursor: "pointer",
                color: "rgba(255,255,255,0.7)",
                fontSize: "11px",
                display: "flex",
                alignItems: "center",
                gap: "4px",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) =>
                ((e.target as HTMLElement).style.background =
                  "rgba(255,255,255,0.14)")
              }
              onMouseLeave={(e) =>
                ((e.target as HTMLElement).style.background =
                  "rgba(255,255,255,0.08)")
              }
            >
              {copied ? <Check size={11} /> : <Copy size={11} />}
              {copied ? "Copied" : "Copy Draft"}
            </button>
          )}
          <button
            data-testid="action-card-dismiss-btn"
            onClick={(e) => {
              e.stopPropagation()
              handleDismiss()
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.3)",
              padding: "2px",
              display: "flex",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) =>
              ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.6)")
            }
            onMouseLeave={(e) =>
              ((e.target as HTMLElement).style.color = "rgba(255,255,255,0.3)")
            }
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Output Text */}
      <p
        data-testid="action-card-output"
        title={result.output}
        style={{
          fontSize: "13px",
          lineHeight: "1.5",
          color: "rgba(255,255,255,0.72)",
          margin: 0,
          wordBreak: "break-word",
        }}
      >
        {displayOutput}
      </p>

      {/* Action Taken Footer */}
      <p
        data-testid="action-card-footer"
        style={{
          fontSize: "10px",
          color: "rgba(255,255,255,0.25)",
          marginTop: "6px",
          marginBottom: 0,
          fontStyle: "italic",
        }}
      >
        {result.actionTaken}
      </p>
    </div>
  )
}
