"use client"

import Link from "next/link"
import { X } from "lucide-react"

interface GuestLimitModalProps {
  onDismiss: () => void
}

export function GuestLimitModal({ onDismiss }: GuestLimitModalProps) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6"
        style={{
          background: "var(--missi-bg)",
          border: "1px solid var(--missi-border-strong)",
          boxShadow: "0 24px 64px var(--missi-shadow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onDismiss}
          className="absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full"
          style={{
            background: "var(--missi-surface)",
            border: "none",
            color: "var(--missi-text-secondary)",
            cursor: "pointer",
          }}
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>

        {/* MISSI mark */}
        <div className="mb-4">
          <svg width="56" height="14" viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="led-modal" width="3" height="2" patternUnits="userSpaceOnUse">
                <rect x="0.25" y="0.25" width="2.5" height="1.5" rx="0.4" fill="var(--missi-text-primary)" />
              </pattern>
              <mask id="text-mask-modal">
                <rect width="100%" height="100%" fill="black" />
                <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
                  fontSize="28" fontWeight="500" fontFamily="'VT323','Space Mono',monospace"
                  fill="white" letterSpacing="5">MISSI</text>
              </mask>
            </defs>
            <rect width="100%" height="100%" fill="url(#led-modal)" mask="url(#text-mask-modal)" />
          </svg>
        </div>

        <h2
          className="text-lg font-semibold mb-1.5"
          style={{ color: "var(--missi-text-primary)", fontFamily: "var(--font-display)" }}
        >
          You&apos;ve used your free messages
        </h2>

        <p
          className="text-sm mb-5 leading-relaxed"
          style={{ color: "var(--missi-text-secondary)" }}
        >
          Create a free account to keep chatting. You'll also unlock memory, voice mode, streaks, and more.
        </p>

        <div className="flex flex-col gap-2.5">
          <Link
            href="/sign-up"
            className="flex items-center justify-center h-11 rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
            style={{
              background: "var(--missi-text-primary)",
              color: "var(--missi-bg)",
              textDecoration: "none",
            }}
          >
            Create free account
          </Link>

          <Link
            href="/sign-in"
            className="flex items-center justify-center h-11 rounded-xl text-sm font-medium transition-all active:scale-[0.97]"
            style={{
              background: "var(--missi-surface)",
              color: "var(--missi-text-primary)",
              border: "1px solid var(--missi-border-strong)",
              textDecoration: "none",
            }}
          >
            Log in
          </Link>
        </div>

        <p
          className="text-center text-[11px] mt-4"
          style={{ color: "var(--missi-text-muted)" }}
        >
          Free account · No credit card required
        </p>
      </div>
    </div>
  )
}
