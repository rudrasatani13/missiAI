"use client"

import { SignIn } from "@clerk/nextjs"
import Link from "next/link"
import Image from "next/image"
import { useEffect, useState } from "react"

export default function SignInPage() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div
      className="min-h-screen bg-black flex flex-col relative overflow-hidden"
      data-testid="sign-in-page"
    >
      {/* Ambient glow — soft, symmetrical */}
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-white/[0.015] blur-[150px]" />
      </div>

      {/* Nav */}
      <nav
        className={`relative z-10 flex items-center justify-between px-6 md:px-10 py-5 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
        }`}
        style={{ fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}
      >
        <Link href="/" className="flex items-center gap-2.5 group" aria-label="Back to home">
          <Image
            src="/images/missiai-logo.png"
            alt=""
            width={26}
            height={26}
            className="rounded-md opacity-80 group-hover:opacity-100 transition-opacity"
          />
          <span className="text-white/50 text-[13px] font-medium tracking-tight group-hover:text-white/70 transition-colors">
            missiAI
          </span>
        </Link>
        <Link
          href="/sign-up"
          className="text-white/30 text-[13px] font-medium hover:text-white/60 transition-colors"
        >
          Create account
        </Link>
      </nav>

      {/* Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-5 pb-20 pt-4">
        <div
          className={`w-full max-w-[380px] flex flex-col items-center transition-all duration-700 delay-100 ${
            mounted
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-5"
          }`}
        >
          {/* Heading */}
          <div className="text-center mb-8" style={{ fontFamily: '"Inter", sans-serif' }}>
            <h1 className="text-[24px] sm:text-[26px] font-semibold text-white tracking-[-0.02em]">
              Welcome back
            </h1>
            <p className="text-white/30 text-[14px] mt-2 font-normal">
              Sign in to continue to missiAI
            </p>
          </div>

          {/* Clerk */}
          <div className="w-full clerk-form-container">
            <SignIn
              routing="hash"
              signUpUrl="/sign-up"
              forceRedirectUrl="/chat"
            />
          </div>
        </div>
      </main>

      {/* Bottom tag */}
      <div
        className={`relative z-10 text-center pb-6 transition-all duration-700 delay-500 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
        style={{ fontFamily: '"Inter", sans-serif' }}
      >
        <p className="text-white/10 text-[11px] font-normal tracking-wide">
          Protected by enterprise-grade encryption
        </p>
      </div>
    </div>
  )
}
