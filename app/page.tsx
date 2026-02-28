"use client"

import { useRef, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Heart, Brain, Eye, Fingerprint, Shield, Headphones, ChevronRight, MessageSquare } from "lucide-react"

/* ─────────────────────────────────────────────────
   Starfield Hero Canvas
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
      initStars()
    }

    const initStars = () => {
      stars = []
      const count = window.innerWidth < 768 ? 100 : 200
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.3,
          brightness: Math.random() * 0.5 + 0.1,
          speed: Math.random() * 0.002 + 0.0005,
          offset: Math.random() * Math.PI * 2,
        })
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Warm subtle radial
      const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.35, 0, canvas.width / 2, canvas.height * 0.35, canvas.width * 0.6)
      grad.addColorStop(0, "rgba(255,220,200,0.008)")
      grad.addColorStop(1, "transparent")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const s of stars) {
        const b = s.brightness * (0.6 + 0.4 * Math.sin(t * s.speed + s.offset))
        ctx.fillStyle = `rgba(255,255,255,${b})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }

      if (Math.random() < 0.0008) {
        const a = Math.PI / 4 + Math.random() * 0.5, sp = 5 + Math.random() * 5, ml = 50 + Math.random() * 50
        shootingStars.push({ x: Math.random() * canvas.width, y: -10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: ml, maxLife: ml })
      }
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const ss = shootingStars[i]; ss.x += ss.vx; ss.y += ss.vy; ss.life--
        const al = (ss.life / ss.maxLife)
        const g = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * 16, ss.y - ss.vy * 16)
        g.addColorStop(0, `rgba(255,255,255,${al})`); g.addColorStop(1, "transparent")
        ctx.strokeStyle = g; ctx.lineWidth = 1.2; ctx.lineCap = "round"
        ctx.beginPath(); ctx.moveTo(ss.x, ss.y); ctx.lineTo(ss.x - ss.vx * 16, ss.y - ss.vy * 16); ctx.stroke()
        if (ss.life <= 0) shootingStars.splice(i, 1)
      }

      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize) }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
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

function RevealSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, visible } = useScrollReveal()
  return (
    <div ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(40px)",
      transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`,
    }}>
      {children}
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
   Feature Card
   ───────────────────────────────────────────────── */
function FeatureCard({ icon: Icon, title, description, delay }: { icon: React.ElementType; title: string; description: string; delay: number }) {
  return (
    <RevealSection delay={delay}>
      <div className="group relative p-6 md:p-8 rounded-2xl transition-all duration-500 hover:scale-[1.02]"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04), transparent 70%)" }} />
        <div className="relative z-10">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <Icon className="w-5 h-5" style={{ color: "rgba(255,255,255,0.6)" }} />
          </div>
          <h3 className="text-base md:text-lg font-medium text-white mb-2 tracking-tight">{title}</h3>
          <p className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>{description}</p>
        </div>
      </div>
    </RevealSection>
  )
}

/* ─────────────────────────────────────────────────
   Emotional Chat Demo
   ───────────────────────────────────────────────── */
function EmotionalChatDemo() {
  const [step, setStep] = useState(0)

  const conversation = [
    { role: "user" as const, text: "I had a really rough day today..." },
    { role: "ai" as const, text: "I can feel it in your words. You don't have to explain everything right now — I'm here. Last time you felt this way, going for a walk helped. Want to talk about it, or just sit with it for a moment?" },
    { role: "user" as const, text: "How do you remember that?" },
    { role: "ai" as const, text: "Because you matter to me. I remember your patterns, your moods, what lifts you up. That's not data — that's knowing someone. That's what I was built for." },
  ]

  useEffect(() => {
    if (step >= conversation.length) return
    const timer = setTimeout(() => setStep((s) => s + 1), step === 0 ? 1500 : 2500)
    return () => clearTimeout(timer)
  }, [step, conversation.length])

  return (
    <div className="flex flex-col gap-4">
      {conversation.slice(0, step).map((msg, i) => (
        <div
          key={i}
          className="flex"
          style={{
            justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            animation: "fadeUp 0.4s ease-out both",
          }}
        >
          {msg.role === "ai" && (
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mr-3 mt-1 overflow-hidden select-none"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <Image src="/images/logo-symbol.png" alt="M" width={18} height={18}
                className="w-[18px] h-[18px] opacity-80 select-none pointer-events-none" draggable={false} />
            </div>
          )}
          <div
            className="text-sm font-light leading-relaxed"
            style={{
              maxWidth: "80%",
              padding: msg.role === "user" ? "10px 16px" : "10px 2px",
              borderRadius: msg.role === "user" ? 18 : 0,
              background: msg.role === "user" ? "rgba(255,255,255,0.08)" : "transparent",
              border: msg.role === "user" ? "1px solid rgba(255,255,255,0.1)" : "none",
              color: msg.role === "user" ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.7)",
            }}
          >
            {msg.text}
          </div>
        </div>
      ))}

      {step < conversation.length && (
        <div className="flex items-center gap-1 pl-10">
          {[0, 1, 2].map((i) => (
            <span key={i} className="w-1.5 h-1.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.4)",
                animation: `typingBounce 1.2s ease-in-out ${i * 0.15}s infinite`,
              }} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────
   MAIN LANDING PAGE
   ───────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="bg-black text-white font-inter overflow-x-hidden">

      {/* ═══════════════════════════════════════════
          HERO — Personal Intelligence
          ═══════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col">
        <HeroStarfield />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
          <Link href="/" className="block select-none">
            <div className="relative" onContextMenu={(e) => e.preventDefault()}>
              <Image src="/images/logo-symbol.png" alt="missiAI" width={40} height={40}
                className="w-9 h-9 md:w-10 md:h-10 opacity-80 hover:opacity-100 transition-opacity duration-300 select-none pointer-events-none"
                priority draggable={false} />
            </div>
          </Link>
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/chat" className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10" style={{ color: "rgba(255,255,255,0.6)" }}>
              Try Chat
            </Link>
            <Link href="/manifesto" className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10 hidden sm:inline-flex" style={{ color: "rgba(255,255,255,0.6)" }}>
              Manifesto
            </Link>
            <Link href="/waitlist"
              className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
              Join Waitlist
            </Link>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center pb-24">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8"
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)", animation: "fadeUp 0.8s ease-out both",
            }}>
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Personal Intelligence — Early Access
          </div>

          {/* Logo */}
          <div className="mb-6 select-none" style={{ animation: "fadeUp 0.8s ease-out 0.1s both" }}>
            <Image src="/images/missiai-logo.png" alt="missiAI" width={500} height={120}
              className="h-14 md:h-20 lg:h-24 w-auto object-contain brightness-0 invert select-none pointer-events-none"
              priority draggable={false} onContextMenu={(e) => e.preventDefault()} />
          </div>

          {/* Headline */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] max-w-3xl mb-5"
            style={{ animation: "fadeUp 0.8s ease-out 0.2s both" }}>
            Not just AI.{" "}
            <span className="relative">
              Your AI.
              <span className="absolute -bottom-1 left-0 w-full h-[2px] rounded-full"
                style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.1))" }} />
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-base md:text-lg font-light leading-relaxed max-w-xl mb-10"
            style={{ color: "rgba(255,255,255,0.45)", animation: "fadeUp 0.8s ease-out 0.3s both" }}>
            missiAI is a personal intelligence that feels, understands, and grows with you.
            It doesn&apos;t just answer questions — it knows when you&apos;re struggling,
            celebrates when you win, and remembers what matters to you.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-3" style={{ animation: "fadeUp 0.8s ease-out 0.4s both" }}>
            <Link href="/chat"
              className="group inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
              Meet missiAI
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/waitlist"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}>
              Get Early Access
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10" style={{ animation: "fadeUp 0.8s ease-out 0.6s both" }}>
          <div className="w-5 h-8 rounded-full border border-white/20 flex justify-center pt-1.5">
            <div className="w-1 h-2 rounded-full bg-white/40 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          WHAT IS missiAI — Emotional Core
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-36 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center">
          <RevealSection>
            <p className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              What is missiAI?
            </p>
          </RevealSection>
          <RevealSection delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-6 leading-snug">
              Imagine an intelligence that{" "}
              <span style={{ color: "rgba(255,255,255,0.4)" }}>actually cares</span>
            </h2>
          </RevealSection>
          <RevealSection delay={0.2}>
            <p className="text-sm md:text-base font-light leading-[1.85] max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              Most AI treats you like a stranger every time. missiAI is different. It&apos;s your personal intelligence —
              like EDITH, like JARVIS — built to understand not just your words, but your emotions, your patterns,
              your unspoken needs. It remembers your bad days. It knows what makes you smile. It evolves with every
              conversation until it feels less like software and more like someone who genuinely knows you.
            </p>
          </RevealSection>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          EMOTIONAL CAPABILITIES
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-16 md:mb-20">
          <RevealSection>
            <p className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              Core Capabilities
            </p>
          </RevealSection>
          <RevealSection delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-5">
              Intelligence meets{" "}
              <span style={{ color: "rgba(255,255,255,0.4)" }}>empathy</span>
            </h2>
          </RevealSection>
          <RevealSection delay={0.2}>
            <p className="text-sm md:text-base font-light leading-relaxed max-w-lg mx-auto" style={{ color: "rgba(255,255,255,0.4)" }}>
              Six pillars that make missiAI unlike anything you&apos;ve ever experienced.
            </p>
          </RevealSection>
        </div>

        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          <FeatureCard
            icon={Heart}
            title="Emotional Awareness"
            description="missiAI reads between the lines. It detects your mood, tone, and emotional state — responding with genuine empathy, not scripted phrases."
            delay={0}
          />
          <FeatureCard
            icon={Brain}
            title="Deep Memory"
            description="Remembers your conversations, preferences, dreams, and struggles. Not as cold data — but as the story of who you are."
            delay={0.1}
          />
          <FeatureCard
            icon={Eye}
            title="Contextual Understanding"
            description="Knows the difference between you venting and asking for advice. Understands context, nuance, and what you actually need in the moment."
            delay={0.15}
          />
          <FeatureCard
            icon={Fingerprint}
            title="Uniquely Yours"
            description="No two missiAI experiences are alike. It adapts to your personality, communication style, and evolves to become YOUR intelligence."
            delay={0.2}
          />
          <FeatureCard
            icon={Shield}
            title="Trust & Privacy"
            description="Your deepest thoughts deserve the strongest protection. End-to-end encryption. Zero data selling. Your mind is sacred."
            delay={0.25}
          />
          <FeatureCard
            icon={Headphones}
            title="Always Present"
            description="Not just available 24/7 — but genuinely attentive. Like a friend who's always there when you need them, without judgment."
            delay={0.3}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          LIVE EMOTIONAL CHAT DEMO
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <RevealSection>
            <p className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              See it in action
            </p>
          </RevealSection>
          <RevealSection delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              This is how it{" "}
              <span style={{ color: "rgba(255,255,255,0.4)" }}>feels</span>
            </h2>
          </RevealSection>
        </div>

        <RevealSection className="max-w-2xl mx-auto">
          <div className="rounded-2xl md:rounded-3xl overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Chat header */}
            <div className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="flex items-center gap-2">
                <Image src="/images/logo-symbol.png" alt="M" width={20} height={20}
                  className="w-5 h-5 opacity-70 select-none pointer-events-none" draggable={false} />
                <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>missiAI</span>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400/80 ml-1" />
              </div>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
              </div>
            </div>

            {/* Live chat demo */}
            <div className="px-5 md:px-8 py-6 md:py-8 min-h-[280px]">
              <EmotionalChatDemo />
            </div>
          </div>
        </RevealSection>

        <RevealSection delay={0.2} className="text-center mt-8">
          <Link href="/chat" className="group inline-flex items-center gap-2 text-sm font-medium transition-all duration-300"
            style={{ color: "rgba(255,255,255,0.5)" }}>
            Experience it yourself
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </RevealSection>
      </section>

      {/* ═══════════════════════════════════════════
          NOT LIKE OTHERS — Comparison
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <RevealSection>
            <p className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              The difference
            </p>
          </RevealSection>
          <RevealSection delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
              AI assistants vs{" "}
              <span style={{ color: "rgba(255,255,255,0.4)" }}>Personal Intelligence</span>
            </h2>
          </RevealSection>
        </div>

        <RevealSection className="max-w-2xl mx-auto">
          <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
            {/* Header row */}
            <div className="grid grid-cols-3 gap-0 text-center text-xs font-medium py-4 px-4"
              style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <div style={{ color: "rgba(255,255,255,0.3)" }}>Feature</div>
              <div style={{ color: "rgba(255,255,255,0.3)" }}>Regular AI</div>
              <div className="text-white">missiAI</div>
            </div>

            {[
              { feature: "Remembers you", regular: "—", missi: "Always" },
              { feature: "Understands emotions", regular: "—", missi: "Deeply" },
              { feature: "Adapts to your mood", regular: "—", missi: "Real-time" },
              { feature: "Grows with you", regular: "—", missi: "Every day" },
              { feature: "Feels personal", regular: "Generic", missi: "Uniquely you" },
              { feature: "Privacy", regular: "Varies", missi: "Non-negotiable" },
            ].map((row, i) => (
              <div key={i} className="grid grid-cols-3 gap-0 text-center text-sm py-3.5 px-4"
                style={{ borderBottom: i < 5 ? "1px solid rgba(255,255,255,0.04)" : "none", background: i % 2 === 0 ? "rgba(255,255,255,0.01)" : "transparent" }}>
                <div className="font-light" style={{ color: "rgba(255,255,255,0.6)" }}>{row.feature}</div>
                <div className="font-light" style={{ color: "rgba(255,255,255,0.2)" }}>{row.regular}</div>
                <div className="font-medium text-white">{row.missi}</div>
              </div>
            ))}
          </div>
        </RevealSection>
      </section>

      {/* ═══════════════════════════════════════════
          STATS
          ═══════════════════════════════════════════ */}
      <section className="relative py-20 md:py-28 px-6">
        <div className="max-w-4xl mx-auto rounded-3xl px-8 py-14 md:py-20"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
            <AnimatedStat value={10} suffix="x" label="More Personal" />
            <AnimatedStat value={99} suffix="%" label="Uptime" />
            <AnimatedStat value={50} suffix="k+" label="Early Adopters" />
            <AnimatedStat value={100} suffix="%" label="Privacy Guaranteed" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          VISION QUOTE
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6">
        <RevealSection className="max-w-2xl mx-auto text-center">
          <div className="mb-6" style={{ color: "rgba(255,255,255,0.15)", fontSize: 48, lineHeight: 1 }}>&ldquo;</div>
          <p className="text-lg md:text-xl font-light leading-[1.8] italic mb-8" style={{ color: "rgba(255,255,255,0.6)" }}>
            I didn&apos;t want to build another chatbot. I wanted to build something that makes people feel understood —
            something that remembers not just what you said, but how you felt when you said it.
            That&apos;s missiAI.
          </p>
          <div className="flex flex-col items-center gap-1">
            <span className="text-2xl font-script italic" style={{ fontFamily: "var(--font-dancing-script), cursive", transform: "rotate(-2deg)", display: "inline-block" }}>
              Rudra S.
            </span>
            <span className="text-xs font-light" style={{ color: "rgba(255,255,255,0.3)" }}>
              Rudra Satani, Creator of missiAI
            </span>
          </div>
        </RevealSection>
      </section>

      {/* ═══════════════════════════════════════════
          FINAL CTA
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 text-center">
        <RevealSection>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-semibold tracking-tight mb-5 max-w-2xl mx-auto leading-snug">
            Your personal intelligence{" "}
            <span style={{ color: "rgba(255,255,255,0.4)" }}>is waiting.</span>
          </h2>
        </RevealSection>
        <RevealSection delay={0.1}>
          <p className="text-sm md:text-base font-light max-w-md mx-auto mb-10" style={{ color: "rgba(255,255,255,0.4)" }}>
            The future of AI isn&apos;t artificial. It&apos;s personal.
          </p>
        </RevealSection>
        <RevealSection delay={0.2}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/waitlist"
              className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}>
              Get Early Access
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/chat"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}>
              <MessageSquare className="w-4 h-4" />
              Meet missiAI
            </Link>
          </div>
        </RevealSection>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════ */}
      <footer className="relative px-6 md:px-10 py-10" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Image src="/images/logo-symbol.png" alt="missiAI" width={24} height={24}
              className="w-6 h-6 opacity-60 select-none pointer-events-none" draggable={false} />
            <span className="text-xs font-light" style={{ color: "rgba(255,255,255,0.3)" }}>
              © 2025 missiAI — Personal Intelligence. All rights reserved.
            </span>
          </div>
          <div className="flex items-center gap-6">
            {[
              { label: "Manifesto", href: "/manifesto" },
              { label: "Waitlist", href: "/waitlist" },
              { label: "Chat", href: "/chat" },
              { label: "GitHub", href: "https://github.com/rudrasatani13/missiAI" },
            ].map((link) => (
              <Link key={link.label} href={link.href}
                className="text-xs transition-colors hover:text-white/60" style={{ color: "rgba(255,255,255,0.3)" }}>
                {link.label}
              </Link>
            ))}
          </div>
          <div className="text-xs font-light" style={{ color: "rgba(255,255,255,0.25)" }}>
            Built with <Heart className="w-3 h-3 inline-block mx-0.5" style={{ color: "rgba(255,255,255,0.3)" }} /> by{" "}
            <span className="text-white/40">Rudra Satani</span>
          </div>
        </div>
      </footer>

      {/* Animations */}
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 0.9; }
        }
      `}</style>
    </div>
  )
}