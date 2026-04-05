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
      {/* Ambient background gradient */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        aria-hidden="true"
      >
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-white/[0.02] blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-white/[0.015] blur-[100px]" />
      </div>

      {/* Top nav bar */}
      <nav
        className={`relative z-10 flex items-center justify-between px-6 md:px-10 py-5 transition-all duration-700 ${
          mounted ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
        }`}
      >
        <Link
          href="/"
          className="flex items-center gap-2.5 group"
          aria-label="Back to home"
        >
          <Image
            src="/images/missiai-logo.png"
            alt="missiAI"
            width={28}
            height={28}
            className="rounded-md opacity-90 group-hover:opacity-100 transition-opacity"
          />
          <span className="text-white/70 text-sm font-medium tracking-tight group-hover:text-white/90 transition-colors">
            missiAI
          </span>
        </Link>
        <Link
          href="/sign-up"
          className="text-white/40 text-sm hover:text-white/70 transition-colors"
        >
          Create account
        </Link>
      </nav>

      {/* Main content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-4 pb-16 pt-4">
        <div
          className={`w-full max-w-[420px] flex flex-col items-center transition-all duration-700 delay-150 ${
            mounted
              ? "opacity-100 translate-y-0 scale-100"
              : "opacity-0 translate-y-6 scale-[0.97]"
          }`}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-[26px] sm:text-[28px] font-semibold text-white tracking-tight leading-tight">
              Welcome back
            </h1>
            <p className="text-white/40 text-sm mt-2 leading-relaxed">
              Sign in to continue to missiAI
            </p>
          </div>

          {/* Clerk Sign-In component */}
          <div className="w-full clerk-form-container">
            <SignIn
              appearance={{
                variables: {
                  fontFamily:
                    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
                  colorPrimary: "#ffffff",
                  colorBackground: "#000000",
                  colorText: "#ffffff",
                  colorInputBackground: "#0a0a0a",
                  colorInputText: "#ffffff",
                  borderRadius: "0.75rem",
                },
                elements: {
                  rootBox: "w-full",
                  card: "bg-transparent shadow-none border-none p-0",
                  headerTitle: "hidden",
                  headerSubtitle: "hidden",
                  socialButtonsBlockButton:
                    "bg-white/[0.04] border border-white/[0.08] text-white hover:bg-white/[0.08] hover:border-white/[0.15] transition-all duration-200 rounded-xl h-12 font-medium",
                  socialButtonsBlockButtonText: "font-medium text-[14px]",
                  formFieldLabel: "text-white/60 font-medium text-[13px] mb-1.5",
                  formFieldInput:
                    "bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 focus:border-white/30 focus:ring-1 focus:ring-white/10 transition-all duration-200 rounded-xl h-12 px-4 text-[15px]",
                  footerActionLink:
                    "text-white/70 hover:text-white font-medium transition-colors",
                  footerActionText: "text-white/35",
                  formButtonPrimary:
                    "bg-white text-black hover:bg-white/90 active:bg-white/80 rounded-xl font-semibold transition-all duration-200 h-12 text-[15px] shadow-lg shadow-white/5",
                  formFieldSuccessText: "text-emerald-400 text-xs",
                  formFieldErrorText: "text-red-400/90 text-xs mt-1",
                  dividerLine: "bg-white/[0.06]",
                  dividerText: "text-white/30 text-xs",
                  otpCodeFieldInput:
                    "bg-white/[0.04] border-white/[0.08] text-white text-center text-lg h-13 rounded-xl focus:border-white/30",
                  formResendCodeLink:
                    "text-white/50 hover:text-white/80 transition-colors",
                  identityPreviewEditButton:
                    "text-white/50 hover:text-white transition-colors",
                  identityPreviewText: "text-white/70",
                  alertText: "text-white/70 text-sm",
                  alert: "bg-red-500/10 border border-red-500/20 rounded-xl",
                  spinner: "text-white",
                  formButtonPrimary__loading: "opacity-70",
                  footer: "mt-4",
                  backLink:
                    "text-white/50 hover:text-white/80 transition-colors",
                },
              }}
              routing="hash"
              signUpUrl="/sign-up"
              forceRedirectUrl="/chat"
            />
          </div>
        </div>
      </main>

      {/* Subtle bottom line */}
      <div
        className={`relative z-10 text-center pb-6 transition-all duration-700 delay-500 ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
      >
        <p className="text-white/15 text-[11px]">
          Protected by enterprise-grade encryption
        </p>
      </div>
    </div>
  )
}
