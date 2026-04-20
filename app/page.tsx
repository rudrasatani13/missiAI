"use client"

import { useRef, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import localFont from "next/font/local"
import { ArrowRight, Mic, Waves, Lock, Zap, Clock, Globe, Sparkles } from "lucide-react"
import { motion } from "framer-motion"
import { Magnetic } from "@/components/ui/Magnetic"
import { MissiOrb } from "@/components/ui/MissiOrb"
import { CookieConsent } from "@/components/ui/CookieConsent"

const ithacaFont = localFont({
  src: "./fonts/Ithaca.ttf",
  variable: "--font-ithaca",
  display: "swap",
})

import { Space_Grotesk } from "next/font/google"
const spaceFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space",
  display: "swap",
})

import { useUser } from "@clerk/nextjs"
import { useRouter } from "next/navigation"

// Capture referral code from URL on landing page
function useReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get('ref')
    if (refCode) {
      localStorage.setItem('missi-referral-code', refCode)
      const url = new URL(window.location.href)
      url.searchParams.delete('ref')
      window.history.replaceState({}, '', url.toString())
    }
  }, [])
}

/* ─────────────────────────────────────────────────
   Starfield Canvas
   ───────────────────────────────────────────────── */
function HeroStarfield() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    let stars: { x: number; y: number; size: number; brightness: number; speed: number; offset: number }[] = []
    let shootingStars: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      stars = []
      const count = window.innerWidth < 768 ? 120 : 300
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width, y: Math.random() * canvas.height,
          size: Math.random() * 1.2 + 0.3, brightness: Math.random() * 0.5 + 0.15,
          speed: Math.random() * 0.002 + 0.0005, offset: Math.random() * Math.PI * 2,
        })
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.3, 0, canvas.width / 2, canvas.height * 0.3, canvas.width * 0.7)
      grad.addColorStop(0, "rgba(255,220,200,0.006)")
      grad.addColorStop(1, "transparent")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const s of stars) {
        const b = s.brightness * (0.6 + 0.4 * Math.sin(t * s.speed + s.offset))
        ctx.fillStyle = `rgba(255,255,255,${b})`
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2); ctx.fill()
      }

      if (Math.random() < 0.002) {
        const a = Math.PI / 4 + Math.random() * 0.5, sp = 5 + Math.random() * 5, ml = 50 + Math.random() * 50
        shootingStars.push({ x: Math.random() * canvas.width, y: -10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: ml, maxLife: ml })
      }
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i]; ss.x += ss.vx; ss.y += ss.vy; ss.life--
        const al = (ss.life / ss.maxLife)
        const g = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 22, ss.y - ss.vy * 22)
        g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(1, "transparent")
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineCap = "round"
        ctx.beginPath(); ctx.moveTo(ss.x, ss.y); ctx.lineTo(ss.x - ss.vx * 22, ss.y - ss.vy * 22); ctx.stroke()
        if (ss.life <= 0) shootingStars.splice(i, 1)
      }
      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize) }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ willChange: "auto" }} />
}

/* ─────────────────────────────────────────────────
   Scroll Reveal
   ───────────────────────────────────────────────── */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return { ref, visible }
}

function Reveal({ children, className = "", delay = 0, blur = true }: { children: React.ReactNode; className?: string; delay?: number; blur?: boolean }) {
  const { ref, visible } = useScrollReveal()
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0, 
      transform: visible ? "translateY(0)" : "translateY(32px)",
      filter: visible || !blur ? "blur(0px)" : "blur(12px)",
      transition: `opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, filter 0.8s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
    }}>{children}</div>
  )
}

/* ─────────────────────────────────────────────────
   Voice Waveform Animation
   ───────────────────────────────────────────────── */
function VoiceWaveform() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    const w = 280, h = 40
    canvas.width = w
    canvas.height = h

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h)
      ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const freq1 = Math.sin((x * 0.03) + (t * 0.002)) * 8
        const freq2 = Math.sin((x * 0.05) + (t * 0.003)) * 5
        const freq3 = Math.sin((x * 0.02) + (t * 0.0015)) * 4
        const envelope = Math.sin((x / w) * Math.PI)
        const y = (h / 2) + (freq1 + freq2 + freq3) * envelope
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = "rgba(255,255,255,0.15)"
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Second wave layer
      ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const freq1 = Math.sin((x * 0.04) + (t * 0.0025) + 1) * 6
        const freq2 = Math.sin((x * 0.06) + (t * 0.002) + 2) * 4
        const envelope = Math.sin((x / w) * Math.PI)
        const y = (h / 2) + (freq1 + freq2) * envelope
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.strokeStyle = "rgba(255,255,255,0.08)"
      ctx.lineWidth = 1
      ctx.stroke()

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [])

  return <canvas ref={canvasRef} width={280} height={40} className="opacity-80" />
}



/* ─────────────────────────────────────────────────
   Animated Counter
   ───────────────────────────────────────────────── */
function AnimatedStat({ value, suffix, label }: { value: number; suffix: string; label: string }) {
  const { ref, visible } = useScrollReveal()
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!visible) return
    let start = 0
    const step = (ts: number) => {
      if (!start) start = ts
      const p = Math.min((ts - start) / 2000, 1)
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * value))
      if (p < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [visible, value])

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl md:text-5xl font-semibold tracking-tight text-white mb-2">{count}{suffix}</div>
      <div className="text-xs md:text-sm font-light tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>{label}</div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Auth-Aware Nav
   ───────────────────────────────────────────────── */
function NavButtons() {
  const { isSignedIn, isLoaded } = useUser()

  return (
    <div className="flex items-center gap-2 md:gap-3">
      {isLoaded && (
        isSignedIn ? (
              <Magnetic>
                <Link href="/chat" className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
                  style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
                  Open missi
                </Link>
              </Magnetic>
            ) : (
              <>
                <Link href="/sign-in" className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10"
                  style={{ color: "rgba(255,255,255,0.6)" }}>
                  Log in
                </Link>
                <Magnetic>
                  <Link href="/sign-up"
                    className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
                    style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
                    Sign up
                  </Link>
                </Magnetic>
              </>
        )
      )}
      <Link href="/manifesto" className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10 hidden sm:inline-flex"
        style={{ color: "rgba(255,255,255,0.6)" }}>
        Manifesto
      </Link>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN LANDING PAGE
   ───────────────────────────────────────────────── */
export default function LandingPage() {
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()
  useReferralCapture()

  // ── Redirect authenticated users to /chat ──
  // Middleware handles this server-side, but this is a client-side fallback
  // in case the page was served from cache or a static export.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/chat")
    }
  }, [isLoaded, isSignedIn, router])

  // Don't flash the landing page while checking auth state
  if (!isLoaded || isSignedIn) {
    return (
      <div className="min-h-screen bg-black" style={{ backgroundColor: '#000000' }} />
    )
  }

  return (
    <div className={`bg-black text-white overflow-x-hidden ${ithacaFont.variable} ${spaceFont.variable}`} style={{ fontFamily: "var(--font-space), system-ui, sans-serif", backgroundColor: '#000000', color: '#ffffff' }}>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#000000' }}>
        <HeroStarfield />

        <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
          <Link href="/" className="block select-none">
            <div className="relative" onContextMenu={(e) => e.preventDefault()}>
              <Image src="/missi-ai-logo.png" alt="missiAI" width={40} height={40}
                className="w-9 h-9 md:w-10 md:h-10 opacity-80 hover:opacity-100 transition-opacity duration-300 select-none pointer-events-none"
                priority draggable={false} />
            </div>
          </Link>
          <NavButtons />
        </nav>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center pb-24">


          {/* LED Matrix Logo */}
          <div className="mb-4 select-none w-full flex justify-center relative z-10 led-logo-container" style={{ animation: "fadeUp 0.8s ease-out 0.1s both, crtFlicker 8s infinite" }}>
            <div className="w-[80vw] md:w-[55vw] max-w-[800px] relative">
              <svg className="w-full h-auto drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" viewBox="0 0 800 220">
                <defs>
                  {/* The square/pill dot pattern matching the reference image */}
                  <pattern id="led-pattern" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
                    {/* distinct ovalish blocks for the LED cells */}
                    <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="#ffffff" />
                  </pattern>
                  <pattern id="led-pattern-red" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
                    <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="rgba(255, 60, 60, 1)" />
                  </pattern>
                  <pattern id="led-pattern-blue" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
                    <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="rgba(60, 150, 255, 1)" />
                  </pattern>
                  <mask id="text-mask">
                    <rect width="100%" height="100%" fill="black" />
                    <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
                          fontSize="220" fontWeight="400" fontFamily="'VT323', 'Space Mono', monospace" fill="white" letterSpacing="18">
                      MISSI
                    </text>
                  </mask>
                </defs>

                {/* Ambient Glows - Tighter and less blue to match reference */}
                <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
                      fontSize="220" fontWeight="400" fontFamily="'VT323', 'Space Mono', monospace" fill="#ffffff" opacity="0.15" style={{ filter: "blur(12px)" }} letterSpacing="18">
                  MISSI
                </text>
                <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
                      fontSize="220" fontWeight="400" fontFamily="'VT323', 'Space Mono', monospace" fill="#e0f2fe" opacity="0.3" style={{ filter: "blur(4px)" }} letterSpacing="18">
                  MISSI
                </text>

                {/* Chromatic aberration layers: tight and bright */}
                <rect x="-1.5" width="100%" height="100%" fill="url(#led-pattern-red)" mask="url(#text-mask)" opacity="0.8" />
                <rect x="1.5" width="100%" height="100%" fill="url(#led-pattern-blue)" mask="url(#text-mask)" opacity="0.8" />
                
                {/* Main dotted text - Crisp white */}
                <rect x="0" width="100%" height="100%" fill="url(#led-pattern)" mask="url(#text-mask)" />
              </svg>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl tracking-wide leading-[1.2] max-w-3xl mb-4"
            style={{ animation: "fadeUp 0.8s ease-out 0.2s both", fontFamily: "var(--font-ithaca)" }}>
            The only AI{" "}
            <span className="relative">
              that knows you.
              <span className="absolute -bottom-1 left-0 w-full h-[2px] rounded-full"
                style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.05))" }} />
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-xs md:text-sm font-light leading-relaxed max-w-lg mb-8"
            style={{ color: "rgba(255,255,255,0.4)", animation: "fadeUp 0.8s ease-out 0.3s both" }}>
            missiAI is a voice assistant that actually knows you. It listens, remembers,
            adapts — and talks back like someone who genuinely gives a damn.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3" style={{ animation: "fadeUp 0.8s ease-out 0.4s both" }}>
            <Magnetic>
              <Link href="/chat"
                className="group inline-flex items-center gap-2.5 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
                style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
                <Mic className="w-4 h-4" />
                Try missi
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Magnetic>

          </div>

          {/* Waveform decoration replaced by MissiOrb */}
          <div className="mt-12 w-64 h-64 flex items-center justify-center opacity-90" style={{ animation: "fadeUp 1.2s ease-out 0.6s both" }}>
            <MissiOrb />
          </div>
        </div>
      </section>

      {/* ═══════════════ WHAT IS MISSI ═══════════════ */}
      <section className="relative py-24 md:py-36 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center">
          <Reveal>
            <p className="text-[11px] font-medium tracking-[0.25em] uppercase mb-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              What is missiAI?
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-6 leading-snug">
              Other AIs answer questions.{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>missi knows you.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="text-sm md:text-base font-light leading-[1.9] max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.45)" }}>
              Every voice assistant treats you like a stranger. Ask one something at 2 AM and you&apos;ll get
              a Wikipedia summary. Ask missi and she&apos;ll know you&apos;ve been stressed about work all week,
              that you skipped the gym today, that you need a reminder for your sister&apos;s birthday tomorrow —
              and that what you actually need isn&apos;t information. It&apos;s someone who remembers the full picture.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <Reveal>
            <p className="text-[11px] font-medium tracking-[0.25em] uppercase mb-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              How it works
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              Simple to start.{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>Gets smarter over time.</span>
            </h2>
          </Reveal>
        </div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Just talk",
              desc: "Open missiAI and start speaking. No setup, no forms, no training required. Your first conversation starts right now.",
            },
            {
              step: "02",
              title: "She remembers",
              desc: "Every conversation builds your memory graph. Goals, habits, emotions, preferences — missi holds it all without you ever having to repeat yourself.",
            },
            {
              step: "03",
              title: "She shows up first",
              desc: "Before you even ask, missi nudges you about your streak, flags what's coming, and checks in when it matters. Proactive, personal, persistent.",
            },
          ].map((item, i) => (
            <Reveal key={i} delay={i * 0.1} className="h-full">
              <div className="relative h-full flex flex-col p-7 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)" }}>
                <span className="text-[10px] font-medium tracking-[0.3em] uppercase mb-5 block" style={{ color: "rgba(255,255,255,0.2)" }}>
                  {item.step}
                </span>
                <h3 className="text-[15px] font-medium text-white mb-2.5 tracking-tight">{item.title}</h3>
                <p className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>{item.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════ CAPABILITIES ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <Reveal>
            <p className="text-[11px] font-medium tracking-[0.25em] uppercase mb-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              What missi can do
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              Built different.{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>On purpose.</span>
            </h2>
          </Reveal>
        </div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { icon: Waves, title: "Emotional Awareness", desc: "Reads your tone, not just your words. Detects stress, excitement, and hesitation — and responds to what you actually feel." },
            { icon: Sparkles, title: "Persistent Memory", desc: "Remembers you across every session. Goals, habits, relationships — your personal graph grows with every conversation." },
            { icon: Zap, title: "Instant Voice", desc: "Sub-200ms latency. No awkward pauses. Conversations flow the way real ones do — fast and natural." },
            { icon: Clock, title: "Proactive Intelligence", desc: "Missi checks in before you have to ask. Streak reminders, prep nudges, wind-down summaries — all timed to your life." },
            { icon: Lock, title: "Private by Design", desc: "Everything is end-to-end encrypted. Your data is never sold, never shared. Privacy is the foundation, not an afterthought." },
            { icon: Globe, title: "Works Everywhere", desc: "Same memory, same personality, same missi — across phone, desktop, and web. Wherever you are, she is too." },
          ].map((item, i) => (
            <Reveal key={i} delay={i * 0.05} className="h-full">
              <div className="group relative h-full flex flex-col p-6 md:p-7 rounded-2xl transition-all duration-500 hover:scale-[1.02]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.05), transparent 70%)" }} />
                <div className="relative z-10">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <item.icon className="w-4.5 h-4.5" style={{ color: "rgba(255,255,255,0.55)" }} />
                  </div>
                  <h3 className="text-[15px] font-medium text-white mb-2 tracking-tight">{item.title}</h3>
                  <p className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>{item.desc}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ═══════════════ COMPARISON ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <Reveal>
            <p className="text-[11px] font-medium tracking-[0.25em] uppercase mb-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              The difference
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              Every AI vs{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>missi</span>
            </h2>
          </Reveal>
        </div>

        <Reveal className="max-w-2xl mx-auto">
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.12)" }}>
            <div className="grid grid-cols-3 gap-0 text-center text-xs font-medium py-4 px-4"
              style={{ background: "rgba(255,255,255,0.07)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <div style={{ color: "rgba(255,255,255,0.3)" }}>Feature</div>
              <div style={{ color: "rgba(255,255,255,0.3)" }}>Others</div>
              <div className="text-white">missi</div>
            </div>
            {[
              { feature: "Remembers you", regular: "Session only", missi: "Always" },
              { feature: "Understands tone", regular: "—", missi: "Real-time" },
              { feature: "Proactive check-ins", regular: "—", missi: "Daily" },
              { feature: "Personality", regular: "Robotic", missi: "Human" },
              { feature: "Voice + Text", regular: "Separate", missi: "Seamless" },
              { feature: "Privacy", regular: "Questionable", missi: "Non-negotiable" },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 gap-0 text-center text-sm py-3.5 px-4"
                style={{ borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.07)" : "none", background: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}>
                <div className="font-light" style={{ color: "rgba(255,255,255,0.55)" }}>{row.feature}</div>
                <div className="font-light" style={{ color: "rgba(255,255,255,0.2)" }}>{row.regular}</div>
                <div className="font-medium text-white">{row.missi}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ═══════════════ STATS ═══════════════ */}
      <section className="relative py-20 md:py-28 px-6">
        <div className="max-w-4xl mx-auto rounded-3xl px-8 py-14 md:py-20"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
            <AnimatedStat value={200} suffix="ms" label="Voice Latency" />
            <AnimatedStat value={99} suffix="%" label="Uptime" />
            <AnimatedStat value={10} suffix="k+" label="Active Users" />
            <AnimatedStat value={100} suffix="%" label="Encrypted" />
          </div>
        </div>
      </section>

      {/* ═══════════════ FOUNDER QUOTE ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <Reveal className="max-w-2xl mx-auto text-center">
          <div className="mb-6" style={{ color: "rgba(255,255,255,0.12)", fontSize: 48, lineHeight: 1 }}>&ldquo;</div>
          <p className="text-lg md:text-xl font-light leading-[1.8] italic mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
            I was tired of voice assistants that forget me the moment I stop talking.
            I wanted to build something that actually remembers — not just what I said,
            but why it mattered. Something that feels less like a tool, and more like
            someone genuinely in your corner.
          </p>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl italic" style={{ fontFamily: "var(--font-dancing-script), cursive", transform: "rotate(-2deg)", display: "inline-block" }}>
              Rudra S.
            </span>
            <span className="text-xs font-light" style={{ color: "rgba(255,255,255,0.25)" }}>
              Rudra Satani, Creator of missiAI
            </span>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6 text-center">
        <Reveal>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-semibold tracking-tight mb-5 max-w-xl mx-auto leading-snug">
            Say something.{" "}
            <span style={{ color: "rgba(255,255,255,0.35)" }}>missi is listening.</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="text-sm md:text-base font-light max-w-md mx-auto mb-10" style={{ color: "rgba(255,255,255,0.35)" }}>
            The future of AI isn&apos;t artificial. It&apos;s personal. And it starts with one conversation.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Magnetic>
              <Link href="/chat" className="group inline-flex items-center gap-2.5 px-8 py-3.5 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
                style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
                <Mic className="w-4 h-4" />
                Try missi free
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Magnetic>

          </div>
        </Reveal>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="relative px-6 md:px-10 py-10" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image src="/missi-ai-logo.png" alt="missiAI" width={24} height={24} className="w-6 h-6 opacity-60 select-none pointer-events-none" draggable={false} />
            <span className="text-xs font-light" style={{ color: "rgba(255,255,255,0.25)" }}>
              &copy; {new Date().getFullYear()} missiAI. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-6">
            {[
              { label: "Manifesto", href: "/manifesto" },
              { label: "Chat", href: "/chat" },
              { label: "Privacy", href: "/privacy" },
              { label: "Terms", href: "/terms" },
              { label: "GitHub", href: "https://github.com/rudrasatani13/missiAI" },
            ].map((link) => (
              <Link key={link.label} href={link.href} className="text-xs transition-colors hover:text-white/50" style={{ color: "rgba(255,255,255,0.25)" }}>{link.label}</Link>
            ))}
          </div>
        </div>
      </footer>

      {/* ═══════════════ ANIMATIONS ═══════════════ */}
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 0.9; }
        }
        @keyframes waveBar {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
        @keyframes crtFlicker {
          0% { opacity: 0.95; }
          4% { opacity: 0.95; }
          5% { opacity: 0.6; }
          6% { opacity: 0.95; }
          7% { opacity: 0.95; }
          8% { opacity: 0.7; }
          9% { opacity: 1; }
          50% { opacity: 0.95; }
          51% { opacity: 0.8; }
          52% { opacity: 1; }
          100% { opacity: 1; }
        }
        h1, h2, h3 {
          font-family: var(--font-ithaca), monospace !important;
          font-weight: normal !important;
          letter-spacing: 0.05em;
        }
      `}</style>
      <CookieConsent />
    </div>
  )
}
