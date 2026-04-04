"use client"

import { useRef, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Mic, MessageSquare, Volume2, Waves, ChevronRight, Lock, Zap, Clock, Globe, Sparkles } from "lucide-react"
import { useUser } from "@clerk/nextjs"

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

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useScrollReveal()
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(32px)",
      transition: `opacity 0.7s ease ${delay}s, transform 0.7s ease ${delay}s`,
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
   Voice Demo Interaction
   ───────────────────────────────────────────────── */
function VoiceDemo() {
  const [step, setStep] = useState(0)
  const [isListening, setIsListening] = useState(false)

  const conversation = [
    { type: "user-voice" as const, text: "Hey missi, how's my day looking?" },
    { type: "ai-voice" as const, text: "Good morning! You've got a team standup at 10, and that presentation you were nervous about is at 2. You crushed the last one though — you'll be fine. Oh, and it's your mom's birthday tomorrow. Want me to remind you tonight to call her?" },
    { type: "user-voice" as const, text: "Yeah, remind me at 8. Also, play something chill." },
    { type: "ai-voice" as const, text: "Done. I know you've been into lo-fi lately when you're prepping for presentations. Playing your focus playlist. Good luck today." },
  ]

  useEffect(() => {
    if (step >= conversation.length) return
    const delay = step === 0 ? 1500 : 3000
    const timer = setTimeout(() => {
      setIsListening(true)
      setTimeout(() => {
        setIsListening(false)
        setStep(s => s + 1)
      }, 800)
    }, delay)
    return () => clearTimeout(timer)
  }, [step, conversation.length])

  return (
    <div className="flex flex-col gap-5">
      {conversation.slice(0, step).map((msg, i) => (
        <div key={i} className="flex gap-3" style={{ animation: "fadeUp 0.5s ease-out both" }}>
          {msg.type === "ai-voice" ? (
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 overflow-hidden select-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Image src="/images/logo-symbol.png" alt="M" width={20} height={20}
                className="w-5 h-5 opacity-80 select-none pointer-events-none" draggable={false} />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Mic className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.5)" }} />
            </div>
          )}
          <div className="flex-1 pt-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider"
                style={{ color: msg.type === "ai-voice" ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.35)" }}>
                {msg.type === "ai-voice" ? "missi" : "You"}
              </span>
              {msg.type === "ai-voice" && (
                <Volume2 className="w-3 h-3" style={{ color: "rgba(255,255,255,0.25)" }} />
              )}
              {msg.type === "user-voice" && (
                <Mic className="w-3 h-3" style={{ color: "rgba(255,255,255,0.2)" }} />
              )}
            </div>
            <p className="text-sm font-light leading-relaxed"
              style={{ color: msg.type === "ai-voice" ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.55)" }}>
              {msg.text}
            </p>
          </div>
        </div>
      ))}

      {step < conversation.length && (
        <div className="flex items-center gap-3 pl-11">
          {isListening ? (
            <div className="flex items-center gap-[3px]">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="w-[3px] rounded-full" style={{
                  background: "rgba(255,255,255,0.4)",
                  height: 12 + Math.random() * 8,
                  animation: `waveBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                }} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <span key={i} className="w-1.5 h-1.5 rounded-full" style={{
                  background: "rgba(255,255,255,0.35)",
                  animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
                }} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
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
          <Link href="/chat" className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
            style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
            Open missi
          </Link>
        ) : (
          <Link href="/login" className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10"
            style={{ color: "rgba(255,255,255,0.6)" }}>
            Login
          </Link>
        )
      )}
      <Link href="/manifesto" className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10 hidden sm:inline-flex"
        style={{ color: "rgba(255,255,255,0.6)" }}>
        Manifesto
      </Link>
      <Link href="/waitlist"
        className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
        style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
        Join Waitlist
      </Link>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN LANDING PAGE
   ───────────────────────────────────────────────── */
export default function LandingPage() {
  useReferralCapture()

  return (
    <div className="bg-black text-white overflow-x-hidden" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif", backgroundColor: '#000000', color: '#ffffff' }}>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative min-h-screen flex flex-col" style={{ backgroundColor: '#000000' }}>
        <HeroStarfield />

        <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
          <Link href="/" className="block select-none">
            <div className="relative" onContextMenu={(e) => e.preventDefault()}>
              <Image src="/images/logo-symbol.png" alt="missiAI" width={40} height={40}
                className="w-9 h-9 md:w-10 md:h-10 opacity-80 hover:opacity-100 transition-opacity duration-300 select-none pointer-events-none"
                priority draggable={false} />
            </div>
          </Link>
          <NavButtons />
        </nav>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center pb-24">
          {/* Status badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8"
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              color: "rgba(255,255,255,0.5)", animation: "fadeUp 0.8s ease-out both",
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Voice AI — Early Access
          </div>

          {/* Logo */}
          <div className="mb-6 select-none" style={{ animation: "fadeUp 0.8s ease-out 0.1s both" }}>
            <Image src="/images/missiai-logo.png" alt="missiAI" width={500} height={120}
              className="h-14 md:h-20 lg:h-24 w-auto object-contain brightness-0 invert select-none pointer-events-none"
              priority draggable={false} onContextMenu={(e) => e.preventDefault()} />
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] max-w-3xl mb-6"
            style={{ animation: "fadeUp 0.8s ease-out 0.2s both" }}>
            The only AI{" "}
            <span className="relative">
              that knows you.
              <span className="absolute -bottom-1 left-0 w-full h-[2px] rounded-full"
                style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.05))" }} />
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-base md:text-lg font-light leading-relaxed max-w-lg mb-10"
            style={{ color: "rgba(255,255,255,0.4)", animation: "fadeUp 0.8s ease-out 0.3s both" }}>
            missiAI is a voice assistant that actually knows you. It listens, remembers,
            adapts — and talks back like someone who genuinely gives a damn.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3" style={{ animation: "fadeUp 0.8s ease-out 0.4s both" }}>
            <Link href="/chat"
              className="group inline-flex items-center gap-2.5 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
              <Mic className="w-4 h-4" />
              Try missi
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/waitlist"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>
              Get Early Access
            </Link>
          </div>

          {/* Waveform decoration */}
          <div className="mt-16" style={{ animation: "fadeUp 0.8s ease-out 0.6s both", opacity: 0.3 }}>
            <VoiceWaveform />
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
              Others answer questions.{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>missi knows you.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="text-sm md:text-base font-light leading-[1.9] max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.45)" }}>
              Every voice assistant today treats you like a stranger. Ask one something at 2 AM when you can&apos;t sleep
              and you&apos;ll get a Wikipedia summary. Ask missi and she&apos;ll know you&apos;ve been stressed about work all week,
              that you skipped the gym today, and that what you actually need isn&apos;t information — it&apos;s someone
              who remembers the full picture. That&apos;s the difference between a tool and a companion.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ═══════════════ VOICE + CHAT ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <Reveal>
            <p className="text-[11px] font-medium tracking-[0.25em] uppercase mb-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              Two ways to talk
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-5">
              Speak it or type it.{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>missi gets it either way.</span>
            </h2>
          </Reveal>
        </div>

        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Voice Card */}
          <Reveal>
            <div className="group relative p-7 md:p-8 rounded-2xl transition-all duration-500 hover:scale-[1.01]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04), transparent 70%)" }} />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <Mic className="w-5 h-5" style={{ color: "rgba(255,255,255,0.7)" }} />
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider mb-4"
                  style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
                  Primary
                </div>
                <h3 className="text-lg font-medium text-white mb-2.5 tracking-tight">Voice Assistant</h3>
                <p className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Talk naturally, hands-free. missi listens, understands context, and responds in real-time voice.
                  Like having a conversation with someone who actually pays attention.
                </p>
              </div>
            </div>
          </Reveal>

          {/* Chat Card */}
          <Reveal delay={0.1}>
            <div className="group relative p-7 md:p-8 rounded-2xl transition-all duration-500 hover:scale-[1.01]"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
              <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04), transparent 70%)" }} />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-6"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <MessageSquare className="w-5 h-5" style={{ color: "rgba(255,255,255,0.7)" }} />
                </div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium uppercase tracking-wider mb-4"
                  style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.35)" }}>
                  Always Available
                </div>
                <h3 className="text-lg font-medium text-white mb-2.5 tracking-tight">Text Chat</h3>
                <p className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                  In a meeting? Can&apos;t talk? Type instead. Same personality, same memory, same missi.
                  Switch between voice and chat seamlessly.
                </p>
              </div>
            </div>
          </Reveal>
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
            { icon: Waves, title: "Emotional Awareness", desc: "Reads your tone. Detects real emotion beneath surface-level answers." },
            { icon: Sparkles, title: "Deep Memory", desc: "Remembers you across every session. Not data — a living profile." },
            { icon: Zap, title: "Instant Response", desc: "Sub-200ms voice response. Natural, fast, zero artificial delays." },
            { icon: Clock, title: "Proactive Awareness", desc: "Surfaces what matters before you have to ask." },
            { icon: Lock, title: "Private by Default", desc: "End-to-end encrypted. Zero data selling. Privacy non-negotiable." },
            { icon: Globe, title: "Everywhere", desc: "Same memory and personality across phone, desktop, and web." },
          ].map((item, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="group relative p-6 md:p-7 rounded-2xl transition-all duration-500 hover:scale-[1.02]"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.03), transparent 70%)" }} />
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

      {/* ═══════════════ VOICE DEMO ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <Reveal>
            <p className="text-[11px] font-medium tracking-[0.25em] uppercase mb-5" style={{ color: "rgba(255,255,255,0.3)" }}>
              See it in action
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              A morning with{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>missi</span>
            </h2>
          </Reveal>
        </div>

        <Reveal className="max-w-2xl mx-auto">
          <div className="rounded-2xl md:rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-2.5">
                <Image src="/images/logo-symbol.png" alt="M" width={20} height={20}
                  className="w-5 h-5 opacity-70 select-none pointer-events-none" draggable={false} />
                <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>missi</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400/70 ml-0.5" />
              </div>
              <div className="flex items-center gap-2">
                <Mic className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.2)" }} />
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.2)" }}>Voice Mode</span>
              </div>
            </div>

            <div className="px-5 md:px-8 py-6 md:py-8 min-h-[300px]">
              <VoiceDemo />
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.2} className="text-center mt-8">
          <Link href="/chat" className="group inline-flex items-center gap-2 text-sm font-medium transition-all"
            style={{ color: "rgba(255,255,255,0.45)" }}>
            Try it yourself
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Reveal>
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
              Voice assistants vs{" "}
              <span style={{ color: "rgba(255,255,255,0.35)" }}>missi</span>
            </h2>
          </Reveal>
        </div>

        <Reveal className="max-w-2xl mx-auto">
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="grid grid-cols-3 gap-0 text-center text-xs font-medium py-4 px-4"
              style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ color: "rgba(255,255,255,0.3)" }}>Feature</div>
              <div style={{ color: "rgba(255,255,255,0.3)" }}>Others</div>
              <div className="text-white">missi</div>
            </div>
            {[
              { feature: "Remembers you", regular: "Resets daily", missi: "Always" },
              { feature: "Understands tone", regular: "—", missi: "Real-time" },
              { feature: "Proactive help", regular: "Basic", missi: "Context-aware" },
              { feature: "Personality", regular: "Robotic", missi: "Human" },
              { feature: "Text + Voice", regular: "Limited", missi: "Seamless" },
              { feature: "Privacy", regular: "Questionable", missi: "Non-negotiable" },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 gap-0 text-center text-sm py-3.5 px-4"
                style={{ borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
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
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
            <AnimatedStat value={200} suffix="ms" label="Response Time" />
            <AnimatedStat value={99} suffix="%" label="Uptime" />
            <AnimatedStat value={50} suffix="k+" label="Waitlist" />
            <AnimatedStat value={100} suffix="%" label="Encrypted" />
          </div>
        </div>
      </section>

      {/* ═══════════════ FOUNDER QUOTE ═══════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <Reveal className="max-w-2xl mx-auto text-center">
          <div className="mb-6" style={{ color: "rgba(255,255,255,0.12)", fontSize: 48, lineHeight: 1 }}>&ldquo;</div>
          <p className="text-lg md:text-xl font-light leading-[1.8] italic mb-8" style={{ color: "rgba(255,255,255,0.55)" }}>
            I was tired of talking to voice assistants that forget me the second I stop talking.
            I wanted to build one that remembers — not just what I said, but why I said it.
            One that feels less like a tool and more like someone in your corner.
          </p>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl italic" style={{ fontFamily: "var(--font-dancing-script), cursive", transform: "rotate(-2deg)", display: "inline-block" }}>
              Rudra S.
            </span>
            <span className="text-xs font-light" style={{ color: "rgba(255,255,255,0.25)" }}>
              Rudra Satani, Creator
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
            The future of AI isn&apos;t artificial. It&apos;s personal.
          </p>
        </Reveal>
        <Reveal delay={0.2}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/waitlist" className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
              Get Early Access <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/chat" className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.6)" }}>
              <Mic className="w-4 h-4" /> Try missi
            </Link>
          </div>
        </Reveal>
      </section>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="relative px-6 md:px-10 py-10" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image src="/images/logo-symbol.png" alt="missiAI" width={24} height={24} className="w-6 h-6 opacity-60 select-none pointer-events-none" draggable={false} />
            <span className="text-xs font-light" style={{ color: "rgba(255,255,255,0.25)" }}>
              &copy; {new Date().getFullYear()} missiAI. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-6">
            {[
              { label: "Manifesto", href: "/manifesto" },
              { label: "Waitlist", href: "/waitlist" },
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
      `}</style>
    </div>
  )
}