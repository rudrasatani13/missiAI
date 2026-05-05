"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

const STORAGE_KEY = "missi-cookie-consent"

type ConsentValue = "accepted" | "rejected"

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) {
      // Small delay so the banner doesn't flash before hydration settles
      const t = setTimeout(() => setVisible(true), 800)
      return () => clearTimeout(t)
    }
  }, [])

  function accept() {
    localStorage.setItem(STORAGE_KEY, "accepted" satisfies ConsentValue)
    setVisible(false)
  }

  function reject() {
    localStorage.setItem(STORAGE_KEY, "rejected" satisfies ConsentValue)
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "1.5rem",
        left: "1.5rem",
        zIndex: 9999,
        maxWidth: "24rem",
        background: "rgba(14, 14, 14, 0.92)",
        border: "1px solid var(--missi-border)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderRadius: "0.75rem",
        padding: "1.25rem",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6)",
        animation: "slideDown 0.3s ease forwards",
        fontFamily: "'Share Tech Mono', monospace",
      }}
    >
      <p
        style={{
          fontSize: "11px",
          lineHeight: "1.6",
          color: "var(--missi-text-secondary)",
          marginBottom: "1rem",
        }}
      >
        We use essential cookies for authentication (via Clerk) and session
        management. No third-party trackers or ad networks.{" "}
        <Link
          href="/privacy"
          style={{ color: "var(--missi-text-muted)", textDecoration: "underline" }}
        >
          Privacy Policy
        </Link>
      </p>

      <div style={{ display: "flex", gap: "0.625rem" }}>
        <button
          onClick={accept}
          style={{
            flex: 1,
            padding: "0.45rem 0.75rem",
            fontSize: "11px",
            background: "var(--missi-border)",
            color: "#000",
            border: "none",
            borderRadius: "0.4rem",
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.02em",
            transition: "opacity 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
        >
          Accept All
        </button>
        <button
          onClick={reject}
          style={{
            flex: 1,
            padding: "0.45rem 0.75rem",
            fontSize: "11px",
            background: "transparent",
            color: "var(--missi-text-muted)",
            border: "1px solid var(--missi-border)",
            borderRadius: "0.4rem",
            cursor: "pointer",
            fontFamily: "inherit",
            letterSpacing: "0.02em",
            transition: "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--missi-text-secondary)"
            e.currentTarget.style.borderColor = "var(--missi-border-strong)"
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--missi-text-muted)"
            e.currentTarget.style.borderColor = "var(--missi-border)"
          }}
        >
          Reject Non-Essential
        </button>
      </div>
    </div>
  )
}
