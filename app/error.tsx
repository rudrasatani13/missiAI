"use client"

import { useEffect } from "react"
import Link from "next/link"
import Image from "next/image"

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[missiAI] Application error:", error)

    // Auto-recover from stale deployment chunks — reload once
    if (
      error?.name === "ChunkLoadError" ||
      error?.message?.includes("ChunkLoadError") ||
      error?.message?.includes("Failed to load chunk")
    ) {
      const key = "missi-chunk-reload"
      const last = sessionStorage.getItem(key)
      // Only auto-reload once per session to avoid infinite loops
      if (!last || Date.now() - Number(last) > 10000) {
        sessionStorage.setItem(key, String(Date.now()))
        window.location.reload()
        return
      }
    }
  }, [error])

  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Subtle radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 40% at 50% 40%, rgba(255,100,100,0.015), transparent)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-md">
        {/* Logo */}
        <div className="mb-10 select-none">
          <Image
            src="/images/missiai-logo.png"
            alt="missiAI"
            width={160}
            height={40}
            className="h-8 md:h-10 w-auto object-contain brightness-0 invert opacity-60 pointer-events-none"
            draggable={false}
            priority
          />
        </div>

        {/* Error icon */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-8"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
          data-testid="error-icon"
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* Message */}
        <h1
          className="text-xl md:text-2xl font-medium tracking-tight mb-3"
          data-testid="error-heading"
        >
          Something went wrong on our end
        </h1>
        <p
          className="text-sm font-light leading-relaxed mb-10"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          We hit an unexpected issue. This has been logged and we&apos;re
          looking into it.
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03] cursor-pointer"
            style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}
            data-testid="error-try-again-button"
          >
            Try Again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/10"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.6)",
            }}
            data-testid="error-go-home-button"
          >
            Go Home
          </Link>
        </div>
      </div>
    </div>
  )
}
