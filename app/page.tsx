"use client"

import { useRef, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowRight, Brain, Sparkles, Shield, Zap, MessageSquare, ChevronRight } from "lucide-react"

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
    let stars: { x: number; y: number; size: number; brightness: number; speed: number; twinkleOffset: number }[] = []
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
          twinkleOffset: Math.random() * Math.PI * 2,
        })
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Subtle radial gradient overlay
      const grad = ctx.createRadialGradient(canvas.width / 2, canvas.height * 0.4, 0, canvas.width / 2, canvas.height * 0.4, canvas.width * 0.7)
      grad.addColorStop(0, "rgba(255,255,255,0.012)")
      grad.addColorStop(1, "transparent")
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (const s of stars) {
        const b = s.brightness * (0.6 + 0.4 * Math.sin(t * s.speed + s.twinkleOffset))
        ctx.fillStyle = `rgba(255,255,255,${b})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }

      if (Math.random() < 0.001) {
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
   Scroll Fade-In Hook
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
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(40px)",
        transition: `opacity 0.8s ease ${delay}s, transform 0.8s ease ${delay}s`,
      }}
    >
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
    const duration = 2000
    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // easeOutCubic
      setCount(Math.floor(eased * value))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [visible, value])

  return (
    <div ref={ref} className="text-center">
      <div className="text-3xl md:text-5xl font-semibold tracking-tight text-white mb-2">
        {count}{suffix}
      </div>
      <div className="text-xs md:text-sm font-light tracking-wide" style={{ color: "rgba(255,255,255,0.4)" }}>
        {label}
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────
   Feature Card
   ───────────────────────────────────────────────── */
function FeatureCard({ icon: Icon, title, description, delay }: { icon: React.ElementType; title: string; description: string; delay: number }) {
  return (
    <RevealSection delay={delay}>
      <div
        className="group relative p-6 md:p-8 rounded-2xl transition-all duration-500 hover:scale-[1.02]"
        style={{
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Hover glow */}
        <div
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.04), transparent 70%)" }}
        />

        <div className="relative z-10">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center mb-5"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Icon className="w-5 h-5" style={{ color: "rgba(255,255,255,0.6)" }} />
          </div>
          <h3 className="text-base md:text-lg font-medium text-white mb-2 tracking-tight">{title}</h3>
          <p className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.45)" }}>
            {description}
          </p>
        </div>
      </div>
    </RevealSection>
  )
}

/* ─────────────────────────────────────────────────
   Step Card
   ───────────────────────────────────────────────── */
function StepCard({ number, title, description, delay }: { number: string; title: string; description: string; delay: number }) {
  return (
    <RevealSection delay={delay}>
      <div className="flex gap-5 md:gap-6">
        <div
          className="w-10 h-10 md:w-12 md:h-12 rounded-full flex-shrink-0 flex items-center justify-center text-sm md:text-base font-semibold"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "rgba(255,255,255,0.7)",
          }}
        >
          {number}
        </div>
        <div>
          <h3 className="text-base md:text-lg font-medium text-white mb-1 tracking-tight">{title}</h3>
          <p className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
            {description}
          </p>
        </div>
      </div>
    </RevealSection>
  )
}

/* ─────────────────────────────────────────────────
   MAIN LANDING PAGE
   ───────────────────────────────────────────────── */
export default function LandingPage() {
  return (
    <div className="bg-black text-white font-inter overflow-x-hidden">

      {/* ═══════════════════════════════════════════
          HERO SECTION
          ═══════════════════════════════════════════ */}
      <section className="relative min-h-screen flex flex-col">
        <HeroStarfield />

        {/* Nav */}
        <nav className="relative z-10 flex items-center justify-between px-6 md:px-10 py-5">
          {/* Logo */}
          <Link href="/" className="block select-none">
            <div className="relative" onContextMenu={(e) => e.preventDefault()}>
              <Image
                src="/images/logo-symbol.png"
                alt="missiAI"
                width={40}
                height={40}
                className="w-9 h-9 md:w-10 md:h-10 opacity-80 hover:opacity-100 transition-opacity duration-300 select-none pointer-events-none"
                priority
                draggable={false}
              />
            </div>
          </Link>

          {/* Nav links */}
          <div className="flex items-center gap-2 md:gap-3">
            <Link href="/chat"
              className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Try Chat
            </Link>
            <Link href="/manifesto"
              className="px-4 py-2 rounded-full text-sm transition-all duration-300 hover:bg-white/10 hidden sm:inline-flex"
              style={{ color: "rgba(255,255,255,0.6)" }}
            >
              Manifesto
            </Link>
            <Link href="/waitlist"
              className="px-5 py-2 rounded-full text-sm font-medium transition-all duration-300"
              style={{
                background: "rgba(255,255,255,0.9)",
                color: "#000",
              }}
            >
              Join Waitlist
            </Link>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 text-center pb-20">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-8"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.6)",
              animation: "fadeUp 0.8s ease-out both",
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Now in Early Access
          </div>

          {/* Logo */}
          <div className="mb-6 select-none" style={{ animation: "fadeUp 0.8s ease-out 0.1s both" }}>
            <Image
              src="/images/missiai-logo.png"
              alt="missiAI"
              width={500}
              height={120}
              className="h-14 md:h-20 lg:h-24 w-auto object-contain brightness-0 invert select-none pointer-events-none"
              priority
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

          {/* Headline */}
          <h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.1] max-w-3xl mb-5"
            style={{ animation: "fadeUp 0.8s ease-out 0.2s both" }}
          >
            The AI that{" "}
            <span className="relative">
              remembers
              <span
                className="absolute -bottom-1 left-0 w-full h-[2px] rounded-full"
                style={{ background: "linear-gradient(90deg, rgba(255,255,255,0.5), rgba(255,255,255,0.1))" }}
              />
            </span>{" "}
            you.
          </h1>

          {/* Subheadline */}
          <p
            className="text-base md:text-lg font-light leading-relaxed max-w-xl mb-10"
            style={{ color: "rgba(255,255,255,0.45)", animation: "fadeUp 0.8s ease-out 0.3s both" }}
          >
            missiAI doesn&apos;t just respond — it understands, learns, and evolves with every conversation.
            Your thoughts, your context, always remembered.
          </p>

          {/* CTA Buttons */}
          <div
            className="flex flex-col sm:flex-row items-center gap-3"
            style={{ animation: "fadeUp 0.8s ease-out 0.4s both" }}
          >
            <Link href="/chat"
              className="group inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}
            >
              Start Chatting
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/waitlist"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
            >
              Join the Waitlist
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
          FEATURES SECTION
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        {/* Section header */}
        <div className="max-w-3xl mx-auto text-center mb-16 md:mb-20">
          <RevealSection>
            <p className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
              Why missiAI
            </p>
          </RevealSection>
          <RevealSection delay={0.1}>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mb-5">
              Intelligence that grows{" "}
              <span style={{ color: "rgba(255,255,255,0.4)" }}>with you</span>
            </h2>
          </RevealSection>
          <RevealSection delay={0.2}>
            <p className="text-sm md:text-base font-light leading-relaxed max-w-lg mx-auto" style={{ color: "rgba(255,255,255,0.4)" }}>
              Not just another chatbot. missiAI pioneers a new standard in AI — one that adapts,
              remembers, and delivers unprecedented depth in every interaction.
            </p>
          </RevealSection>
        </div>

        {/* Feature grid */}
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          <FeatureCard
            icon={Brain}
            title="Memory Architecture"
            description="Every conversation builds on the last. missiAI remembers your preferences, context, and history — creating a truly personalized experience that deepens over time."
            delay={0}
          />
          <FeatureCard
            icon={Sparkles}
            title="Adaptive Intelligence"
            description="Goes beyond pattern matching. missiAI understands nuance, anticipates your needs, and delivers responses that feel genuinely thoughtful and human-like."
            delay={0.1}
          />
          <FeatureCard
            icon={Zap}
            title="Instant Performance"
            description="Powered by cutting-edge models with optimized inference. Get responses in milliseconds, not seconds — without sacrificing depth or quality."
            delay={0.2}
          />
          <FeatureCard
            icon={Shield}
            title="Privacy First"
            description="Your data, your control. End-to-end encryption, zero data selling, and transparent AI practices. We believe trust is non-negotiable."
            delay={0.3}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          STATS SECTION
          ═══════════════════════════════════════════ */}
      <section className="relative py-20 md:py-28 px-6">
        <div
          className="max-w-4xl mx-auto rounded-3xl px-8 py-14 md:py-20"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
            <AnimatedStat value={10} suffix="x" label="Faster Responses" />
            <AnimatedStat value={99} suffix="%" label="Uptime Reliability" />
            <AnimatedStat value={50} suffix="k+" label="Early Signups" />
            <AnimatedStat value={100} suffix="%" label="Data Privacy" />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          HOW IT WORKS
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16 md:mb-20">
            <RevealSection>
              <p className="text-xs font-medium tracking-[0.2em] uppercase mb-4" style={{ color: "rgba(255,255,255,0.35)" }}>
                How it works
              </p>
            </RevealSection>
            <RevealSection delay={0.1}>
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight">
                Three steps to{" "}
                <span style={{ color: "rgba(255,255,255,0.4)" }}>smarter AI</span>
              </h2>
            </RevealSection>
          </div>

          {/* Steps */}
          <div className="flex flex-col gap-10 md:gap-14 max-w-lg mx-auto">
            <StepCard
              number="01"
              title="Start a Conversation"
              description="Just type naturally. Ask questions, brainstorm ideas, or think out loud. missiAI adapts to your style."
              delay={0}
            />
            <StepCard
              number="02"
              title="Build Context Over Time"
              description="The more you interact, the smarter it gets. missiAI remembers your preferences, past discussions, and working style."
              delay={0.1}
            />
            <StepCard
              number="03"
              title="Experience True Intelligence"
              description="Get responses that feel like they come from someone who truly knows you. That's the power of AI with Memory."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          CHAT PREVIEW SECTION
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 md:px-10">
        <RevealSection className="max-w-3xl mx-auto">
          <div
            className="rounded-2xl md:rounded-3xl overflow-hidden"
            style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {/* Fake chat header */}
            <div className="flex items-center justify-between px-5 py-3.5"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
            >
              <div className="flex items-center gap-2">
                <Image src="/images/logo-symbol.png" alt="M" width={20} height={20}
                  className="w-5 h-5 opacity-70 select-none pointer-events-none" draggable={false} />
                <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>missiAI</span>
              </div>
              <div className="flex gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
              </div>
            </div>

            {/* Fake chat messages */}
            <div className="px-5 md:px-8 py-6 md:py-8 flex flex-col gap-5">
              {/* User */}
              <div className="flex justify-end">
                <div className="px-4 py-2.5 rounded-2xl text-sm" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.85)" }}>
                  Continue where we left off yesterday on the product roadmap
                </div>
              </div>
              {/* AI */}
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <Image src="/images/logo-symbol.png" alt="M" width={16} height={16}
                    className="w-4 h-4 opacity-70 select-none pointer-events-none" draggable={false} />
                </div>
                <div className="text-sm font-light leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                  Of course. Yesterday we finalized the Q2 milestones — user auth, memory persistence, and the API launch.
                  You mentioned wanting to prioritize the memory feature first. Want me to draft the technical spec for that?
                </div>
              </div>
            </div>

            {/* Fake input */}
            <div className="px-5 md:px-8 pb-5">
              <div className="flex items-center rounded-full px-4 py-2.5"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <span className="text-sm font-light" style={{ color: "rgba(255,255,255,0.2)" }}>Ask anything...</span>
              </div>
            </div>
          </div>
        </RevealSection>

        <RevealSection delay={0.2} className="text-center mt-8">
          <Link href="/chat"
            className="group inline-flex items-center gap-2 text-sm font-medium transition-all duration-300"
            style={{ color: "rgba(255,255,255,0.5)" }}
          >
            Try it yourself
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </RevealSection>
      </section>

      {/* ═══════════════════════════════════════════
          FINAL CTA
          ═══════════════════════════════════════════ */}
      <section className="relative py-24 md:py-32 px-6 text-center">
        <RevealSection>
          <h2 className="text-2xl md:text-4xl lg:text-5xl font-semibold tracking-tight mb-5 max-w-2xl mx-auto">
            Ready to experience AI{" "}
            <span style={{ color: "rgba(255,255,255,0.4)" }}>that remembers?</span>
          </h2>
        </RevealSection>
        <RevealSection delay={0.1}>
          <p className="text-sm md:text-base font-light max-w-md mx-auto mb-10" style={{ color: "rgba(255,255,255,0.4)" }}>
            Join thousands of early adopters already shaping the future of human-AI collaboration.
          </p>
        </RevealSection>
        <RevealSection delay={0.2}>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link href="/waitlist"
              className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-medium transition-all duration-300 hover:scale-[1.03]"
              style={{ background: "rgba(255,255,255,0.9)", color: "#000" }}
            >
              Get Early Access
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/chat"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-sm font-medium transition-all duration-300 hover:bg-white/10"
              style={{ border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.7)" }}
            >
              <MessageSquare className="w-4 h-4" />
              Try Chat
            </Link>
          </div>
        </RevealSection>
      </section>

      {/* ═══════════════════════════════════════════
          FOOTER
          ═══════════════════════════════════════════ */}
      <footer className="relative px-6 md:px-10 py-10" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo + copyright */}
          <div className="flex items-center gap-3">
            <Image src="/images/logo-symbol.png" alt="missiAI" width={24} height={24}
              className="w-6 h-6 opacity-60 select-none pointer-events-none" draggable={false} />
            <span className="text-xs font-light" style={{ color: "rgba(255,255,255,0.3)" }}>
              © 2025 missiAI. All rights reserved.
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6">
            <Link href="/manifesto" className="text-xs transition-colors hover:text-white/60" style={{ color: "rgba(255,255,255,0.3)" }}>
              Manifesto
            </Link>
            <Link href="/waitlist" className="text-xs transition-colors hover:text-white/60" style={{ color: "rgba(255,255,255,0.3)" }}>
              Waitlist
            </Link>
            <Link href="/chat" className="text-xs transition-colors hover:text-white/60" style={{ color: "rgba(255,255,255,0.3)" }}>
              Chat
            </Link>
            <a href="https://github.com/rudrasatani13/missiAI" target="_blank" rel="noopener noreferrer"
              className="text-xs transition-colors hover:text-white/60" style={{ color: "rgba(255,255,255,0.3)" }}
            >
              GitHub
            </a>
          </div>

          {/* Signature */}
          <div className="text-xs font-light" style={{ color: "rgba(255,255,255,0.25)" }}>
            Built by <span className="text-white/40">Rudra Satani</span>
          </div>
        </div>
      </footer>

      {/* ═══════════════════════════════════════════
          GLOBAL ANIMATIONS
          ═══════════════════════════════════════════ */}
      <style jsx global>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}