"use client"

import { SignIn, useUser } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LEDLogo } from "@/components/brand/LEDLogo"

type Theme = "dark" | "light"

export default function SignInPage() {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [theme, setTheme] = useState<Theme>("dark")
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    const frame = requestAnimationFrame(() => setEntered(true))
    const check = () => setTheme(
      document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark"
    )
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => { cancelAnimationFrame(frame); obs.disconnect() }
  }, [])

  const isLight = theme === "light"

  // Redirect authenticated users to /chat
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/chat")
    }
  }, [isLoaded, isSignedIn, router])

  if (!mounted || (isLoaded && isSignedIn)) return null

  const authAppearance = {
    baseTheme: dark,
    layout: { logoPlacement: "none", socialButtonsPlacement: "top", showOptionalFields: false },
    variables: {
      colorPrimary: "var(--missi-nav-text-active)",
      colorBackground: "transparent",
      colorText: "var(--missi-text-primary)",
      colorInputBackground: "var(--missi-input-bg)",
      colorInputText: "var(--missi-input-text)",
      borderRadius: "1.1rem",
    },
    elements: {
      rootBox: "w-full max-w-none min-w-0 overflow-hidden",
      cardBox: "w-full max-w-none min-w-0 overflow-hidden rounded-none border-0 bg-transparent shadow-none",
      card: "w-full max-w-none min-w-0 border-0 bg-transparent shadow-none",
      main: "w-full max-w-none min-w-0 gap-0",
      header: "hidden",
      footerAction: "hidden",
      formButtonPrimary: "h-12 rounded-[18px] bg-[var(--missi-nav-text-active)] text-[var(--missi-bg)] hover:opacity-90 cursor-pointer shadow-none text-[14px] font-semibold transition-all duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButton: "h-12 rounded-[18px] border border-[var(--missi-border)] bg-[var(--missi-surface)] text-[var(--missi-text-primary)] hover:bg-[var(--missi-nav-hover)] cursor-pointer shadow-none transition-all duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButtonText: "text-sm font-medium text-[var(--missi-text-primary)]",
      dividerRow: "my-5",
      formFieldLabel: "mb-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--missi-text-muted)]",
      formFieldInput: "h-12 rounded-[18px] border border-[var(--missi-border)] bg-[var(--missi-input-bg)] px-4 text-[var(--missi-text-primary)] shadow-none placeholder:text-[var(--missi-input-placeholder)] focus:border-[var(--missi-border-strong)] cursor-pointer transition-colors duration-300",
      dividerLine: "bg-[var(--missi-border)]",
      dividerText: "text-[10px] uppercase tracking-[0.3em] text-[var(--missi-text-muted)]",
      identityPreview: "rounded-2xl border border-[var(--missi-border)] bg-[var(--missi-surface)] cursor-pointer",
      identityPreviewText: "text-[var(--missi-text-primary)]",
      identityPreviewEditButton: "text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)]",
      formFieldAction: "text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] transition-colors",
      otpCodeFieldInput: "h-12 rounded-2xl border border-[var(--missi-border)] bg-[var(--missi-input-bg)] text-[var(--missi-text-primary)] shadow-none",
      formResendCodeLink: "text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)]",
      alternativeMethodsBlockButton: "rounded-2xl border border-[var(--missi-border)] bg-[var(--missi-surface)] text-[var(--missi-text-primary)] hover:bg-[var(--missi-nav-hover)]",
      alert: "rounded-2xl border border-[var(--missi-border)] bg-[var(--missi-surface)] text-[var(--missi-text-primary)]",
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
      className="relative flex min-h-screen overflow-hidden"
      style={{ background: "var(--missi-bg)" }}
      data-testid="sign-in-page"
    >
      <div className="absolute inset-0" style={{
        background: isLight
          ? "radial-gradient(circle at top left, rgba(30,58,138,0.04), transparent 30%), radial-gradient(circle at bottom right, rgba(99,102,241,0.04), transparent 30%)"
          : "radial-gradient(circle at top left, rgba(236,168,214,0.07), transparent 24%), radial-gradient(circle at top right, rgba(103,232,249,0.07), transparent 26%)"
      }} />

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
                        className="text-5xl leading-[0.95] tracking-[-0.05em] xl:text-[4.5rem]"
                        style={{
                          color: "var(--missi-text-primary)",
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
                className={`mt-8 max-w-xl text-lg leading-relaxed transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ color: "var(--missi-text-secondary)", transitionDelay: "460ms" }}
              >
                Log in to missiAI and continue with the context, memory, and
                daily support already waiting for you.
              </p>
              <div className="mt-10 space-y-4">
                {sideNotes.map((item, index) => (
                  <div key={item} className="overflow-hidden">
                    <div
                      className={`pl-4 text-sm leading-relaxed transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] border-l ${
                        entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                      }`}
                      style={{
                        color: "var(--missi-text-secondary)",
                        borderColor: "var(--missi-border)",
                        transitionDelay: `${620 + index * 120}ms`,
                      }}
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
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.32em]" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface)", color: "var(--missi-border)" }}>
                Login
              </span>
              <h1 className="mt-5 text-[2.35rem] leading-[0.95] sm:text-[3.6rem]" style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif", color: "var(--missi-text-primary)" }}>
                Welcome back
              </h1>
              <p className="mt-4 max-w-[28rem] text-sm leading-relaxed sm:text-[0.98rem]" style={{ color: "var(--missi-text-secondary)" }}>
                Log in to missiAI and continue with the context, memory, and daily
                support already waiting for you.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[36px]" style={{ background: isLight ? "linear-gradient(180deg,rgba(17,24,39,0.04),rgba(17,24,39,0.01))" : "linear-gradient(180deg,var(--missi-surface),var(--missi-surface))" }} />
              <div className="relative overflow-hidden rounded-[32px] p-3" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface)", boxShadow: `0 24px 72px var(--missi-shadow-lg)` }}>
                <div className="grid grid-cols-2 gap-1 rounded-full p-1.5" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface-secondary)" }}>
                  <Link href="/sign-in" className="relative z-10 inline-flex h-11 items-center justify-center rounded-full text-[13px] font-medium transition-colors" style={{ color: "var(--missi-nav-text-active)" }}>
                    <span className="inline-flex h-full w-full items-center justify-center rounded-full" style={{ background: "var(--missi-bg)" }}>Login</span>
                  </Link>
                  <Link href="/sign-up" className="relative z-10 inline-flex h-11 items-center justify-center rounded-full text-[13px] font-medium transition-colors hover:opacity-80" style={{ color: "var(--missi-text-secondary)" }}>
                    Register
                  </Link>
                </div>

                <div className="mt-3.5 overflow-hidden rounded-[26px] p-3.5 sm:p-4" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface)" }}>
                  <div className="mb-4">
                    <div className="text-[11px] uppercase tracking-[0.26em]" style={{ color: "var(--missi-text-muted)" }}>Secure access</div>
                    <div className="mt-2 text-sm leading-relaxed" style={{ color: "var(--missi-text-secondary)" }}>Continue with your saved context and daily memory.</div>
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
              <p className="text-[11px] font-normal uppercase tracking-[0.24em]" style={{ color: "var(--missi-text-muted)" }}>
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
