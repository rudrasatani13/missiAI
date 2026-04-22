"use client"

import { SignIn, useUser } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LEDLogo } from "@/components/ui/LEDLogo"

export default function SignInPage() {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    const frame = requestAnimationFrame(() => setEntered(true))

    return () => cancelAnimationFrame(frame)
  }, [])

  // Redirect authenticated users to /chat
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/chat")
    }
  }, [isLoaded, isSignedIn, router])

  if (!mounted || (isLoaded && isSignedIn)) return null

  const authAppearance = {
    baseTheme: dark,
    layout: {
      logoPlacement: "none",
      socialButtonsPlacement: "top",
      showOptionalFields: false,
    },
    variables: {
      colorPrimary: "#ffffff",
      colorBackground: "transparent",
      colorText: "#ffffff",
      colorInputBackground: "rgba(255,255,255,0.02)",
      colorInputText: "#ffffff",
      borderRadius: "1.1rem",
    },
    elements: {
      rootBox: "w-full max-w-none min-w-0 overflow-hidden",
      cardBox: "w-full max-w-none min-w-0 overflow-hidden rounded-none border-0 bg-transparent shadow-none",
      card: "w-full max-w-none min-w-0 border-0 bg-transparent shadow-none",
      main: "w-full max-w-none min-w-0 gap-0",
      header: "hidden",
      footerAction: "hidden",
      formButtonPrimary: "h-12 rounded-[18px] bg-white text-black hover:bg-white/90 cursor-pointer shadow-none text-[14px] font-semibold transition-transform duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButton: "h-12 rounded-[18px] border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06] cursor-pointer shadow-none transition-all duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButtonText: "text-sm font-medium text-white",
      dividerRow: "my-5",
      formFieldLabel: "mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-white/40",
      formFieldInput: "h-12 rounded-[18px] border border-white/10 bg-white/[0.02] px-4 text-white shadow-none placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.04] cursor-pointer transition-colors duration-300",
      dividerLine: "bg-white/10",
      dividerText: "text-[10px] uppercase tracking-[0.3em] text-white/25",
      identityPreview: "rounded-2xl border border-white/10 bg-white/[0.03] cursor-pointer",
      identityPreviewText: "text-white",
      identityPreviewEditButton: "text-white/50 hover:text-white",
      formFieldAction: "text-white/45 hover:text-white transition-colors",
      otpCodeFieldInput: "h-12 rounded-2xl border border-white/10 bg-white/[0.03] text-white shadow-none",
      formResendCodeLink: "text-white/45 hover:text-white",
      alternativeMethodsBlockButton: "rounded-2xl border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]",
      alert: "rounded-2xl border border-white/10 bg-white/[0.03] text-white",
    },
  } as const

  const sideLines = ["Return to the", "companion that", "remembers the details."]

  const sideNotes = [
    "Memory that picks up exactly where you left off.",
    "Voice and text help that feels natural in daily life.",
    "A private, calmer space for routines, planning, and support.",
  ]

  return (
    <div
      className="relative flex min-h-screen overflow-hidden bg-[#050505]"
      data-testid="sign-in-page"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,168,214,0.07),transparent_24%),radial-gradient(circle_at_top_right,rgba(103,232,249,0.07),transparent_26%)]" />

      {/* Header Logo */}
      <div className="absolute left-5 top-5 z-20 sm:left-6 sm:top-6">
        <Link href="/">
          <LEDLogo />
        </Link>
      </div>

      {/* ──────────────── CENTERED FORM ──────────────── */}
      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-12 px-5 py-20 sm:px-6 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:px-10 lg:py-12">
        <div
          className={`hidden lg:block transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="max-w-xl pr-8 xl:pr-14">
            <div>
              <div className="mt-8 space-y-1.5">
                {sideLines.map((line, index) => (
                  <div key={line} className="overflow-hidden">
                    <div
                      className={`transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-12"
                      }`}
                      style={{
                        transitionDelay: `${180 + index * 110}ms`,
                      }}
                    >
                      <div
                        className="text-5xl leading-[0.95] tracking-[-0.05em] text-white xl:text-[4.5rem]"
                        style={{
                          fontFamily: "'Instrument Sans', system-ui, sans-serif",
                          animation: entered
                            ? `authTextFloat ${8 + index * 1.2}s ease-in-out ${1.1 + index * 0.22}s infinite`
                            : undefined,
                        }}
                      >
                        {line}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p
                className={`mt-8 max-w-xl text-lg leading-relaxed text-white/48 transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: "460ms" }}
              >
                Log in to missiAI and continue with the context, memory, and
                daily support already waiting for you.
              </p>
              <div className="mt-10 space-y-4">
                {sideNotes.map((item, index) => (
                  <div key={item} className="overflow-hidden">
                    <div
                      className={`border-l border-white/10 pl-4 text-sm leading-relaxed text-white/54 transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                      }`}
                      style={{ transitionDelay: `${620 + index * 120}ms` }}
                    >
                      {item}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          className={`mx-auto w-full max-w-[480px] transition-all duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            entered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-[0.98]"
          }`}
        >
          <div className="mx-auto w-full max-w-[420px]">
            {/* Heading */}
            <div className="mb-4 sm:mb-5">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.32em] text-white/45">
                Login
              </span>
              <h1 className="mt-5 text-[2.35rem] leading-[0.95] text-white sm:text-[3.6rem]" style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
                Welcome back
              </h1>
              <p className="mt-4 max-w-[28rem] text-sm leading-relaxed text-white/48 sm:text-[0.98rem]">
                Log in to missiAI and continue with the context, memory, and daily
                support already waiting for you.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[36px] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]" />
              <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#090909] p-3 shadow-[0_24px_72px_rgba(0,0,0,0.44)]">
                <div className="grid grid-cols-2 gap-1 rounded-full border border-white/8 bg-black p-1.5">
                  <Link href="/sign-in" className="relative z-10 inline-flex h-11 items-center justify-center rounded-full text-[13px] font-medium text-black transition-colors">
                    <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-white">Login</span>
                  </Link>
                  <Link href="/sign-up" className="relative z-10 inline-flex h-11 items-center justify-center rounded-full text-[13px] font-medium text-white/52 transition-colors hover:text-white">
                    Register
                  </Link>
                </div>

                <div className="mt-3.5 overflow-hidden rounded-[26px] border border-white/10 bg-[#050505] p-3.5 sm:p-4">
                  <div className="mb-4">
                    <div className="text-[11px] uppercase tracking-[0.26em] text-white/30">Secure access</div>
                    <div className="mt-2 text-sm leading-relaxed text-white/46">Continue with your saved context and daily memory.</div>
                  </div>
                  <div className="auth-clerk-shell w-full overflow-hidden">
                    <SignIn
                      routing="hash"
                      signUpUrl="/sign-up"
                      forceRedirectUrl="/chat"
                      fallbackRedirectUrl="/chat"
                      appearance={authAppearance}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 text-center w-full">
              <p className="text-[11px] font-normal uppercase tracking-[0.24em] text-white/14">
                Protected by Clerk encryption
              </p>
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes authTextFloat {
          0%, 100% { transform: translate3d(0, 0, 0); opacity: 1; }
          50% { transform: translate3d(0, -8px, 0); }
        }
      `}</style>
    </div>
  )
}
