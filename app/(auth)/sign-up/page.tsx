"use client"

import { SignUp, useUser } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LEDLogo } from "@/components/brand/LEDLogo"

export default function SignUpPage() {
  const [mounted, setMounted] = useState(false)
  const [entered, setEntered] = useState(false)
  const [isLight, setIsLight] = useState(false)
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
    const frame = requestAnimationFrame(() => setEntered(true))
    const check = () => setIsLight(
      document.documentElement.getAttribute("data-theme") === "light"
    )
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => { cancelAnimationFrame(frame); obs.disconnect() }
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
      formButtonPrimary: "h-11 rounded-[16px] bg-[var(--missi-nav-text-active)] text-[var(--missi-bg)] hover:opacity-90 cursor-pointer shadow-none text-[13px] font-semibold transition-all duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButton: "h-11 rounded-[16px] border border-[var(--missi-border)] bg-[var(--missi-surface)] text-[var(--missi-text-primary)] hover:bg-[var(--missi-nav-hover)] cursor-pointer shadow-none transition-all duration-300 hover:-translate-y-0.5",
      socialButtonsBlockButtonText: "text-[13px] font-medium text-[var(--missi-text-primary)]",
      dividerRow: "my-5",
      formFieldLabel: "mb-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--missi-text-muted)]",
      formFieldInput: "h-11 rounded-[16px] border border-[var(--missi-border)] bg-[var(--missi-input-bg)] px-4 text-[var(--missi-text-primary)] text-[13px] shadow-none placeholder:text-[var(--missi-input-placeholder)] focus:border-[var(--missi-border-strong)] cursor-pointer transition-colors duration-300",
      dividerLine: "bg-[var(--missi-border)]",
      dividerText: "text-[10px] uppercase tracking-[0.3em] text-[var(--missi-text-muted)]",
      identityPreview: "rounded-[16px] border border-[var(--missi-border)] bg-[var(--missi-surface)] cursor-pointer",
      identityPreviewText: "text-[var(--missi-text-primary)]",
      identityPreviewEditButton: "text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)]",
      formFieldAction: "text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] transition-colors",
      otpCodeFieldInput: "h-11 rounded-[16px] border border-[var(--missi-border)] bg-[var(--missi-input-bg)] text-[var(--missi-text-primary)] shadow-none",
      formResendCodeLink: "text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)]",
      alternativeMethodsBlockButton: "rounded-[16px] border border-[var(--missi-border)] bg-[var(--missi-surface)] text-[var(--missi-text-primary)] hover:bg-[var(--missi-nav-hover)]",
      alert: "rounded-[16px] border border-[var(--missi-border)] bg-[var(--missi-surface)] text-[var(--missi-text-primary)]",
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
      className="relative flex min-h-screen overflow-hidden"
      style={{ background: "var(--missi-bg)" }}
      data-testid="sign-up-page"
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
                        className="text-[3.25rem] leading-[0.94] tracking-[-0.055em] xl:text-[4rem]"
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
                className={`mt-6 max-w-[30rem] text-[0.96rem] leading-relaxed transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  entered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                }`}
                style={{ color: "var(--missi-text-secondary)", transitionDelay: "460ms" }}
              >
                Start with private memory, natural voice help, and steady
                support designed to feel useful from day one.
              </p>
              <div className="mt-7 space-y-3">
                {sideNotes.map((item, index) => (
                  <div key={item} className="overflow-hidden">
                    <div
                      className={`pl-4 text-[12px] leading-relaxed transition-all duration-[950ms] ease-[cubic-bezier(0.22,1,0.36,1)] border-l ${
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
          className={`mx-auto w-full max-w-[450px] transition-all duration-[1000ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            entered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-8 scale-[0.98]"
          }`}
        >
          <div className="mx-auto w-full max-w-[400px]">
            {/* Heading */}
            <div className="mb-3 sm:mb-4">
              <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.32em]" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface)", color: "var(--missi-border)" }}>
                Register
              </span>
              <h1 className="mt-4 text-[2.15rem] leading-[0.95] sm:text-[3.2rem]" style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif", color: "var(--missi-text-primary)" }}>
                Create account
              </h1>
              <p className="mt-3.5 max-w-[26rem] text-[13px] leading-relaxed sm:text-[0.92rem]" style={{ color: "var(--missi-text-secondary)" }}>
                Create your missiAI account and start with memory, voice support,
                and everyday guidance in one place.
              </p>
            </div>

            <div className="relative">
              <div className="absolute inset-0 rounded-[36px]" style={{ background: isLight ? "linear-gradient(180deg,rgba(17,24,39,0.04),rgba(17,24,39,0.01))" : "linear-gradient(180deg,var(--missi-surface),var(--missi-surface))" }} />
              <div className="relative overflow-hidden rounded-[30px] p-2.5" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface)", boxShadow: `0 20px 60px var(--missi-shadow-lg)` }}>
                <div className="grid grid-cols-2 gap-1 rounded-full p-1.5" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface-secondary)" }}>
                  <Link href="/sign-in" className="relative z-10 inline-flex h-10 items-center justify-center rounded-full text-[12px] font-medium transition-colors hover:opacity-80" style={{ color: "var(--missi-text-secondary)" }}>
                    Login
                  </Link>
                  <Link href="/sign-up" className="relative z-10 inline-flex h-10 items-center justify-center rounded-full text-[12px] font-medium transition-colors" style={{ color: "var(--missi-nav-text-active)" }}>
                    <span className="inline-flex h-full w-full items-center justify-center rounded-full" style={{ background: "white" }}>Register</span>
                  </Link>
                </div>

                <div className="mt-3 overflow-hidden rounded-[24px] p-3 sm:p-3.5" style={{ border: "1px solid var(--missi-border)", background: "var(--missi-surface)" }}>
                  <div className="mb-3.5">
                    <div className="text-[10px] uppercase tracking-[0.24em]" style={{ color: "var(--missi-text-muted)" }}>Get started</div>
                    <div className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--missi-text-secondary)" }}>Create your account and begin with private memory.</div>
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
