"use client"

import { SignIn } from "@clerk/nextjs"
import { useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"

/* ─── Starfield ─────────────────────────────────── */
function StarfieldCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    let stars: { x: number; y: number; size: number; brightness: number; speed: number; offset: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      stars = []
      const count = window.innerWidth < 768 ? 70 : 140
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          size: Math.random() * 1.3 + 0.2, brightness: Math.random() * 0.4 + 0.1,
          speed: Math.random() * 0.002 + 0.0005, offset: Math.random() * Math.PI * 2,
        })
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const s of stars) {
        const b = s.brightness * (0.65 + 0.35 * Math.sin(t * s.speed + s.offset))
        ctx.fillStyle = `rgba(255,255,255,${b})`
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill()
      }
      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }} />
}

export default function Page() {
  return (
    <>
      <div className="fixed inset-0 bg-black" />
      <StarfieldCanvas />

      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-5 font-inter">

        {/* Back to home */}
        <div className="absolute top-5 left-5">
          <Link href="/public"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all duration-200 hover:bg-white/10"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" }}>
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Home</span>
          </Link>
        </div>

        {/* Logo */}
        <div className="mb-8">
          <Image src="/images/missiai-logo.png" alt="missiAI" width={200} height={50}
            className="h-14 w-auto object-contain brightness-0 invert opacity-90 select-none pointer-events-none"
            priority draggable={false} />
        </div>

        {/* Clerk SignIn Component */}
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full max-w-sm",
              card: "bg-transparent shadow-none border-0",
              cardBox: "rounded-2xl shadow-none",
              headerTitle: "text-white text-xl",
              headerSubtitle: "text-white/40 text-xs",
              socialButtonsBlockButton: "bg-white/[0.06] border border-white/10 text-white/85 hover:bg-white/[0.12] rounded-xl",
              socialButtonsBlockButtonText: "text-sm font-medium",
              dividerLine: "bg-white/[0.08]",
              dividerText: "text-white/25 text-[11px]",
              formFieldLabel: "text-white/50 text-xs",
              formFieldInput: "bg-transparent border-white/10 text-white/85 rounded-xl text-sm focus:border-white/30",
              formButtonPrimary: "bg-white/90 text-black hover:bg-white rounded-xl text-sm font-medium",
              footerActionLink: "text-white/70 hover:text-white font-medium",
              footerActionText: "text-white/35 text-xs",
              identityPreviewEditButton: "text-white/50",
              formFieldAction: "text-white/50 text-xs",
              otpCodeFieldInput: "border-white/10 text-white",
              alert: "bg-red-500/10 border border-red-500/20 text-red-400/80",
            },
          }}
          routing="path"
          path="/login"
          signUpUrl="/sign-up"
          forceRedirectUrl="/chat"
        />

        <p className="text-center text-[11px] mt-4" style={{ color: "rgba(255,255,255,0.15)" }}>
          By continuing, you agree to missiAI&apos;s Terms & Privacy Policy
        </p>
      </div>
    </>
  )
}