"use client"

import { SignUp, useUser } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LEDLogo } from "@/components/ui/LEDLogo"

export default function SignUpPage() {
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
      formButtonPrimary: "h-11 rounded-[16px] bg-white text-black hover:bg-white/90 cursor-pointer shadow-none text-[13px] font-semibold transition-transform duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButton: "h-11 rounded-[16px] border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06] cursor-pointer shadow-none transition-all duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButtonText: "text-[13px] font-medium text-white",
      dividerRow: "my-5",
      formFieldLabel: "mb-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-white/36",
      formFieldInput: "h-11 rounded-[16px] border border-white/10 bg-white/[0.02] px-4 text-white text-[13px] shadow-none placeholder:text-white/25 focus:border-white/25 focus:bg-white/[0.04] cursor-pointer transition-colors duration-300",
      dividerLine: "bg-white/10",
      dividerText: "text-[10px] uppercase tracking-[0.3em] text-white/25",
      identityPreview: "rounded-[16px] border border-white/10 bg-white/[0.03] cursor-pointer",
      identityPreviewText: "text-white",
      identityPreviewEditButton: "text-white/50 hover:text-white",
      formFieldAction: "text-white/45 hover:text-white transition-colors",
      otpCodeFieldInput: "h-11 rounded-[16px] border border-white/10 bg-white/[0.03] text-white shadow-none",
      formResendCodeLink: "text-white/45 hover:text-white",
      alternativeMethodsBlockButton: "rounded-[16px] border border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.06]",
      alert: "rounded-[16px] border border-white/10 bg-white/[0.03] text-white",
    },
  } as const

  const sideLines = ["Set up a calmer", "companion for", "your real daily life."]

  const sideNotes = [
    "Start with memory that grows more useful over time.",
    "Get voice and text help that fits naturally into your day.",
    "Keep your routines, planning, and support in one place.",
  ]

  return (
    <div
      className="relative flex min-h-screen overflow-hidden bg-[#050505]"
      data-testid="sign-up-page"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(236,168,214,0.07),transparent_24%),radial-gradient(circle_at_top_right,rgba(103,232,249,0.07),transparent_26%)]" />

      {/* Header Logo */}
      <div className="absolute left-5 top-5 z-20 sm:left-6 sm:top-6">
        <Link href="/">
          <LEDLogo />
        </Link>
      </div>

      {/* ──────────────── CENTERED FORM ──────────────── */}
      <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-10 px-5 py-16 sm:px-6 sm:py-16 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12 lg:px-10 lg:py-8">
        <div
          className={`hidden lg:block transition-all duration-[1100ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-10"
          }`}
        >
          <div className="max-w-xl pr-8 xl:pr-14">
            <div>
              <div className="mt-5 space-y-1">
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
                        className="text-[3.25rem] leading-[0.94] tracking-[-0.055em] text-white xl:text-[4rem]"
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
                className={`mt-6 max-w-[30rem] text-[0.96rem] leading-relaxed text-white/48 transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ transitionDelay: "460ms" }}
              >
                Start with private memory, natural voice help, and steady
                support designed to feel useful from day one.
              </p>
              <div className="mt-7 space-y-3">
                {sideNotes.map((item, index) => (
                  <div key={item} className="overflow-hidden">
                    <div
                      className={`border-l border-white/10 pl-4 text-[12px] leading-relaxed text-white/52 transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
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
          className={`mx-auto w-full max-w-[450px] transition-all duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            entered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-[0.98]"
          }`}
        >
          <div className="mx-auto w-full max-w-[400px]">
            {/* Heading */}
            <div className="mb-3 sm:mb-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-[0.32em] text-white/45">
                Register
              </span>
              <h1 className="mt-4 text-[2.15rem] leading-[0.95] text-white sm:text-[3.2rem]" style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
                Create account
              </h1>
              <p className="mt-3.5 max-w-[26rem] text-[13px] leading-relaxed text-white/48 sm:text-[0.92rem]">
                Create your missiAI account and start with memory, voice support,
                and everyday guidance in one place.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[36px] bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))]" />
              <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[#090909] p-2.5 shadow-[0_20px_60px_rgba(0,0,0,0.42)]">
                <div className="grid grid-cols-2 gap-1 rounded-full border border-white/8 bg-black p-1.5">
                  <Link href="/sign-in" className="relative z-10 inline-flex h-10 items-center justify-center rounded-full text-[12px] font-medium text-white/52 transition-colors hover:text-white">
                    Login
                  </Link>
                  <Link href="/sign-up" className="relative z-10 inline-flex h-10 items-center justify-center rounded-full text-[12px] font-medium text-black transition-colors">
                    <span className="inline-flex h-full w-full items-center justify-center rounded-full bg-white">Register</span>
                  </Link>
                </div>

                <div className="mt-3 overflow-hidden rounded-[24px] border border-white/10 bg-[#050505] p-3 sm:p-3.5">
                  <div className="mb-3.5">
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/30">Get started</div>
                    <div className="mt-1.5 text-[12px] leading-relaxed text-white/44">Create your account and begin with private memory.</div>
                  </div>
                  <div className="auth-clerk-shell w-full overflow-hidden">
                    <SignUp
                      routing="hash"
                      signInUrl="/sign-in"
                      forceRedirectUrl="/chat"
                      fallbackRedirectUrl="/chat"
                      appearance={authAppearance}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-3.5 text-center w-full">
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
