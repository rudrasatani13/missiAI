"use client"

import { type ComponentType, type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useUser } from "@clerk/nextjs"
import {
  Bell,
  BrainCircuit,
  CalendarDays,
  GraduationCap,
  Lock,
  Menu,
  MessageSquareText,
  Mic,
  NotebookText,
  Shield,
  Wallet,
  X,
} from "lucide-react"
import { LEDLogo } from "@/components/ui/LEDLogo"
import Image from "next/image"
import { CookieConsent } from "@/components/ui/CookieConsent"
import { ProductShowcase } from "./ProductShowcase"

const heroWords = ["remembers", "gets it", "listens", "helps"]
const pageShell = "mx-auto w-full max-w-[1560px] px-4 sm:px-6 lg:px-8 xl:px-10"

const featheredLandscapeMask: CSSProperties = {
  WebkitMaskImage: "radial-gradient(152% 118% at 50% 50%, #000 40%, rgba(0,0,0,0.98) 56%, rgba(0,0,0,0.86) 68%, rgba(0,0,0,0.42) 82%, transparent 100%)",
  maskImage: "radial-gradient(152% 118% at 50% 50%, #000 40%, rgba(0,0,0,0.98) 56%, rgba(0,0,0,0.86) 68%, rgba(0,0,0,0.42) 82%, transparent 100%)",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
}

const featheredPortraitMask: CSSProperties = {
  WebkitMaskImage: "radial-gradient(104% 124% at 58% 50%, #000 40%, rgba(0,0,0,0.98) 56%, rgba(0,0,0,0.86) 70%, rgba(0,0,0,0.38) 84%, transparent 100%)",
  maskImage: "radial-gradient(104% 124% at 58% 50%, #000 40%, rgba(0,0,0,0.98) 56%, rgba(0,0,0,0.86) 70%, rgba(0,0,0,0.38) 84%, transparent 100%)",
  WebkitMaskRepeat: "no-repeat",
  maskRepeat: "no-repeat",
}

const processSteps = [
  {
    number: "01",
    title: "Talk",
    subtitle: "naturally",
    description: "Speak in whatever language feels natural. missi listens like a companion, not a form.",
  },
  {
    number: "02",
    title: "Save",
    subtitle: "what matters",
    description: "People, plans, moods, reminders, and goals become living context instead of disappearing after one chat.",
  },
  {
    number: "03",
    title: "Help",
    subtitle: "through the day",
    description: "missi can follow through with reminders, study support, budget check-ins, and gentle daily nudges.",
  },
]

const presenceModes = [
  {
    title: "Morning planning",
    description: "Start with a daily brief that remembers your priorities, unfinished tasks, and energy.",
  },
  {
    title: "Memory recall",
    description: "Bring back names, plans, routines, and details without digging through old chats.",
  },
  {
    title: "Study support",
    description: "Use Exam Buddy for revision, weak-topic practice, and calmer preparation.",
  },
  {
    title: "Money awareness",
    description: "Use Budget Buddy for quick expense logging and a clearer sense of what changed this month.",
  },
]

const toolCards: Array<{
  name: string
  category: string
  icon: ComponentType<{ className?: string }>
}> = [
  { name: "Voice chat", category: "Core", icon: Mic },
  { name: "Living memory", category: "Core", icon: BrainCircuit },
  { name: "Notes", category: "Capture", icon: NotebookText },
  { name: "Reminders", category: "Daily", icon: Bell },
  { name: "Planning", category: "Daily", icon: CalendarDays },
  { name: "Budget Buddy", category: "Money", icon: Wallet },
  { name: "Exam Buddy", category: "Study", icon: GraduationCap },
  { name: "Daily briefs", category: "Routine", icon: MessageSquareText },
]

const trustFeatures = [
  {
    icon: Shield,
    label: "Boundaries",
    title: "Permission-led memory",
    description: "missi should hold useful context without feeling extractive or invasive.",
  },
  {
    icon: Lock,
    label: "Security",
    title: "Encrypted by default",
    description: "Private details stay wrapped in a security layer designed for personal AI use.",
  },
  {
    icon: BrainCircuit,
    label: "Transparency",
    title: "Reviewable context",
    description: "Memory is meant to stay understandable, editable, and grounded in what you actually said.",
  },
  {
    icon: Bell,
    label: "Respect",
    title: "Calm daily presence",
    description: "Useful proactive help should feel gentle and timely, not noisy or manipulative.",
  },
]

const footerLinks = {
  Product: [
    { name: "Chat", href: "/chat" },
    { name: "Manifesto", href: "/manifesto" },
    { name: "Pricing", href: "/pricing" },
  ],
  Features: [
    { name: "Memory", href: "#memory" },
    { name: "Daily life", href: "#presence" },
    { name: "Tools", href: "#tools" },
  ],
  Trust: [
    { name: "Privacy", href: "/privacy" },
    { name: "Terms", href: "/terms" },
    { name: "GitHub", href: "https://github.com/rudrasatani13/missiAI" },
  ],
}

function useReferralCapture() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const refCode = params.get("ref")

    if (!refCode) {
      return
    }

    localStorage.setItem("missi-referral-code", refCode)
    const url = new URL(window.location.href)
    url.searchParams.delete("ref")
    window.history.replaceState({}, "", url.toString())
  }, [])
}

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.14 }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, visible }
}

function Reveal({ children, className = "", delay = 0, style }: { children: ReactNode; className?: string; delay?: number; style?: CSSProperties }) {
  const { ref, visible } = useReveal<HTMLDivElement>()

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(28px)",
        filter: visible ? "blur(0px)" : "blur(10px)",
        transition: `opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, filter 0.9s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function CTAArrow({ dark = false }: { dark?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="missi-cta-arrow"
      style={{ color: dark ? "#000000" : "rgba(255,255,255,0.9)" }}
    />
  )
}

function BlurWord({ word, trigger }: { word: string; trigger: number }) {
  const letters = word.split("")
  const [letterStates, setLetterStates] = useState(() => letters.map(() => ({ opacity: 0, blur: 18 })))
  const framesRef = useRef<number[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    const currentLetters = word.split("")

    framesRef.current.forEach(cancelAnimationFrame)
    timersRef.current.forEach(clearTimeout)
    framesRef.current = []
    timersRef.current = []

    setLetterStates(currentLetters.map(() => ({ opacity: 0, blur: 18 })))

    currentLetters.forEach((_, index) => {
      const timer = setTimeout(() => {
        const start = performance.now()

        const tick = (now: number) => {
          const progress = Math.min((now - start) / 500, 1)
          const eased = 1 - Math.pow(1 - progress, 3)

          setLetterStates((previous) => {
            const next = [...previous]
            next[index] = {
              opacity: eased,
              blur: 18 * (1 - eased),
            }
            return next
          })

          if (progress < 1) {
            const id = requestAnimationFrame(tick)
            framesRef.current.push(id)
          }
        }

        const id = requestAnimationFrame(tick)
        framesRef.current.push(id)
      }, index * 48)

      timersRef.current.push(timer)
    })

    return () => {
      framesRef.current.forEach(cancelAnimationFrame)
      timersRef.current.forEach(clearTimeout)
    }
  }, [word, trigger])

  const colors = ["#eca8d6", "#a78bfa", "#67e8f9", "#fbbf24", "#eca8d6"]

  return (
    <>
      {letters.map((char, index) => {
        const colorIndex = (index / Math.max(letters.length - 1, 1)) * (colors.length - 1)
        const lower = Math.floor(colorIndex)
        const upper = Math.min(lower + 1, colors.length - 1)
        const mix = colorIndex - lower

        const hexToRgb = (hex: string) => {
          const r = parseInt(hex.slice(1, 3), 16)
          const g = parseInt(hex.slice(3, 5), 16)
          const b = parseInt(hex.slice(5, 7), 16)
          return [r, g, b]
        }

        const [r1, g1, b1] = hexToRgb(colors[lower])
        const [r2, g2, b2] = hexToRgb(colors[upper])
        const r = Math.round(r1 + (r2 - r1) * mix)
        const g = Math.round(g1 + (g2 - g1) * mix)
        const b = Math.round(b1 + (b2 - b1) * mix)

        return (
          <span
            key={`${char}-${index}-${trigger}`}
            style={{
              display: "inline-block",
              fontFamily: "'Instrument Sans', system-ui, sans-serif",
              fontWeight: 500,
              letterSpacing: "-0.04em",
              opacity: letterStates[index]?.opacity ?? 0,
              filter: `blur(${letterStates[index]?.blur ?? 18}px)`,
              color: `rgb(${r}, ${g}, ${b})`,
            }}
          >
            {char}
          </span>
        )
      })}
    </>
  )
}

function AnimatedCounter({ end, prefix = "", suffix = "" }: { end: number; prefix?: string; suffix?: string }) {
  const { ref, visible } = useReveal<HTMLDivElement>()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!visible) {
      return
    }

    let frame = 0
    let start = 0

    const step = (timestamp: number) => {
      if (!start) {
        start = timestamp
      }

      const progress = Math.min((timestamp - start) / 1800, 1)
      const eased = 1 - Math.pow(1 - progress, 4)
      setCount(Math.floor(eased * end))

      if (progress < 1) {
        frame = requestAnimationFrame(step)
      }
    }

    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [end, visible])

  return (
    <div ref={ref} className="inline-flex items-baseline gap-1 tabular-nums">
      {prefix ? <span className="text-white/45">{prefix}</span> : null}
      <span>{count.toLocaleString()}</span>
      {suffix ? <span className="text-white/45">{suffix}</span> : null}
    </div>
  )
}

function DotGraph({ accent = false, height = 28 }: { accent?: boolean; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const timeRef = useRef(Math.random() * 100)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext("2d")
    if (!context) {
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const width = canvas.offsetWidth || 280
    const localHeight = height
    canvas.width = width * dpr
    canvas.height = localHeight * dpr
    context.scale(dpr, dpr)

    const render = () => {
      context.clearRect(0, 0, width, localHeight)
      const columns = Math.floor(width / 8)
      const time = timeRef.current

      for (let index = 0; index < columns; index += 1) {
        const value = 0.35 + 0.5 * Math.sin(index * 0.26 + time) * Math.cos(index * 0.11 + time * 0.55)
        const normalized = Math.max(0, Math.min(1, value))
        const x = index * 8 + 4
        const y = localHeight - 4 - normalized * (localHeight - 8)
        const alpha = 0.16 + normalized * 0.55
        const radius = 1.5 + normalized * 1.2

        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fillStyle = accent ? `rgba(236, 168, 214, ${alpha})` : `rgba(255, 255, 255, ${alpha})`
        context.fill()
      }

      timeRef.current += accent ? 0.032 : 0.018
      frameRef.current = requestAnimationFrame(render)
    }

    render()
    return () => cancelAnimationFrame(frameRef.current)
  }, [accent, height])

  return <canvas ref={canvasRef} style={{ width: "100%", height: `${height}px`, display: "block" }} />
}

function GridBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef(0)
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext("2d")
    if (!context) {
      return
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    window.addEventListener("resize", resize)

    const render = () => {
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height
      context.clearRect(0, 0, width, height)

      for (let x = 0; x < width; x += 60) {
        for (let y = 0; y < height; y += 60) {
          const wave = Math.sin(x * 0.01 + y * 0.01 + timeRef.current) * 0.5 + 0.5
          context.beginPath()
          context.arc(x, y, 1 + wave * 2, 0, Math.PI * 2)
          context.fillStyle = "rgba(255,255,255,0.04)"
          context.fill()
        }
      }

      const pulseY = (timeRef.current * 30) % height
      context.strokeStyle = "rgba(255,255,255,0.03)"
      context.lineWidth = 1
      context.beginPath()
      context.moveTo(0, pulseY)
      context.lineTo(width, pulseY)
      context.stroke()

      timeRef.current += 0.02
      frameRef.current = requestAnimationFrame(render)
    }

    render()
    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }} />
}

function TopNavigation({ isLoaded, isSignedIn }: { isLoaded: boolean; isSignedIn: boolean | undefined }) {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20)
    window.addEventListener("scroll", onScroll)
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const navLinks = [
    { name: "Memory", href: "#memory" },
    { name: "Process", href: "#process" },
    { name: "Daily life", href: "#presence" },
    { name: "Tools", href: "#tools" },
    { name: "Trust", href: "#trust" },
  ]

  const brandWidth = isScrolled ? "w-[86px] sm:w-[112px]" : "w-[96px] sm:w-[126px]"

  return (
    <header className={`fixed z-50 transition-all duration-500 ${isScrolled ? "left-2 right-2 top-2 sm:left-4 sm:right-4 sm:top-4" : "top-0 left-0 right-0"}`}>
      <nav
        className={`mx-auto transition-all duration-500 ${
          isScrolled || isMobileMenuOpen
            ? "max-w-[1200px] rounded-xl border border-white/10 bg-black/80 shadow-lg backdrop-blur-xl sm:rounded-2xl"
            : "max-w-[1560px] bg-transparent"
        }`}
      >
        <div className={`flex items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-10 transition-all duration-500 ${isScrolled ? "h-14" : "h-16 sm:h-20"}`}>
          <Link href="/" className="flex items-center select-none">
            <div className="flex items-center gap-2">
              <Image src="/missi-m.png" alt="" width={28} height={28} className="h-6 w-auto object-contain sm:h-7" />
              <LEDLogo className="w-[82px] sm:w-[90px] justify-start" />
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-12">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className={`group relative text-sm transition-colors duration-300 ${
                  isScrolled ? "text-white/70 hover:text-white" : "text-white/75 hover:text-white"
                }`}
                style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}
              >
                {link.name}
                <span className={`absolute -bottom-1 left-0 h-px w-0 transition-all duration-300 group-hover:w-full ${isScrolled ? "bg-white" : "bg-white"}`} />
              </a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-4">
            {isLoaded && isSignedIn ? (
              <Link
                href="/chat"
                className={`rounded-full px-5 transition-all duration-500 ${
                  isScrolled
                    ? "h-8 bg-white text-black text-xs inline-flex items-center"
                    : "px-6 py-3 bg-white text-black text-sm inline-flex items-center"
                }`}
                style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}
              >
                Open missi
              </Link>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className={`transition-all duration-500 ${
                    isScrolled ? "text-xs text-white/70 hover:text-white" : "text-sm text-white/75 hover:text-white"
                  }`}
                  style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className={`rounded-full bg-white text-black transition-all duration-500 ${
                    isScrolled ? "px-4 h-8 text-xs inline-flex items-center" : "px-6 py-3 text-sm inline-flex items-center"
                  }`}
                  style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}
                >
                  Start free
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((value) => !value)}
            className={`md:hidden p-1.5 sm:p-2 transition-colors duration-500 ${isScrolled || isMobileMenuOpen ? "text-white" : "text-white"}`}
            aria-label="Toggle navigation"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </nav>

      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/95 backdrop-blur-sm transition-all duration-500 ${
          isMobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex h-full flex-col overflow-y-auto px-5 pb-6 pt-24 sm:px-8 sm:pb-8 sm:pt-28">
          <div className="flex flex-1 flex-col justify-center gap-6 sm:gap-8">
            {navLinks.map((link, index) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-[2.5rem] leading-none text-white transition-all duration-500 sm:text-5xl ${
                  isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
                style={{
                  transitionDelay: isMobileMenuOpen ? `${index * 75}ms` : "0ms",
                  fontFamily: "'Instrument Serif', serif",
                }}
              >
                {link.name}
              </a>
            ))}
          </div>
          <div
            className={`flex flex-col gap-3 border-t border-white/10 pt-6 transition-all duration-500 sm:flex-row sm:gap-4 sm:pt-8 ${
              isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: isMobileMenuOpen ? "260ms" : "0ms", paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
          >
            <Link
              href={isLoaded && isSignedIn ? "/chat" : "/sign-in"}
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-flex h-[4.5rem] flex-1 items-center justify-center rounded-full border-2 border-white/25 bg-white/[0.04] px-7 text-[1.15rem] font-medium text-white/95 shadow-[0_12px_28px_rgba(0,0,0,0.32)] sm:h-14 sm:border sm:border-white/20 sm:bg-white/[0.02] sm:px-5 sm:text-base sm:shadow-none"
              style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}
            >
              {isLoaded && isSignedIn ? "Open missi" : "Sign in"}
            </Link>
            <Link
              href={isLoaded && isSignedIn ? "/chat" : "/sign-up"}
              onClick={() => setIsMobileMenuOpen(false)}
              className="inline-flex h-[4.5rem] flex-1 items-center justify-center rounded-full bg-white px-7 text-[1.18rem] font-semibold text-black shadow-[0_16px_40px_rgba(255,255,255,0.12)] sm:h-14 sm:px-5 sm:text-base sm:font-medium sm:shadow-none"
              style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}
            >
              {isLoaded && isSignedIn ? "Talk now" : "Start free"}
            </Link>
          </div>
        </div>
      </div>
    </header>
  )
}

export function AgenticMissiHome() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()
  const [wordIndex, setWordIndex] = useState(0)
  const [activeProcess, setActiveProcess] = useState(0)
  const [activePresence, setActivePresence] = useState(0)
  const [hoveredTool, setHoveredTool] = useState<number | null>(null)
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number } | null>(null)

  useReferralCapture()

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/chat")
    }
  }, [isLoaded, isSignedIn, router])

  useEffect(() => {
    const interval = setInterval(() => {
      setWordIndex((current) => (current + 1) % heroWords.length)
    }, 2500)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveProcess((current) => (current + 1) % processSteps.length)
    }, 5600)

    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setActivePresence((current) => (current + 1) % presenceModes.length)
    }, 3200)

    return () => clearInterval(interval)
  }, [])

  // activeTrust auto-cycler removed — cards now use consistent static styling

  useEffect(() => {
    document.body.classList.add("landing-homepage")
    return () => document.body.classList.remove("landing-homepage")
  }, [])

  if (!isLoaded || isSignedIn) {
    return <div className="min-h-screen bg-black" style={{ backgroundColor: "#000000" }} />
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black text-white" style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>  
      <TopNavigation isLoaded={isLoaded} isSignedIn={isSignedIn} />

      <section className="relative flex min-h-[100svh] flex-col overflow-hidden bg-black lg:min-h-screen">
        <div className="absolute inset-0 z-0">
          <video autoPlay muted loop playsInline aria-hidden="true" className="h-full w-full object-cover object-[70%_center] opacity-60 sm:object-center sm:opacity-80">
            <source src="/videos/home-hero.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-gradient-to-r from-black/82 via-black/56 to-black/8 sm:from-black/75 sm:via-black/35 sm:to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/18 via-black/26 to-black/78 sm:from-black/15 sm:via-transparent sm:to-black/70" />
        </div>

        <div className="absolute inset-0 z-[2] hidden overflow-hidden pointer-events-none opacity-20 sm:block">
          {[...Array(8)].map((_, index) => (
            <div key={`h-${index}`} className="absolute h-px bg-white/10" style={{ top: `${12.5 * (index + 1)}%`, left: 0, right: 0 }} />
          ))}
          {[...Array(12)].map((_, index) => (
            <div key={`v-${index}`} className="absolute w-px bg-white/10" style={{ left: `${8.33 * (index + 1)}%`, top: 0, bottom: 0 }} />
          ))}
        </div>

        <div className={`relative z-10 ${pageShell} flex flex-1 items-start pb-4 pt-32 sm:min-h-[100svh] sm:pb-12 sm:pt-36 lg:min-h-screen lg:items-center lg:pb-36 lg:pt-40`}>
          <div className="w-full max-w-[28rem] sm:max-w-2xl lg:max-w-[58%]">
            <Reveal delay={0.08} className="mt-2 sm:mt-4">
              <h1 className="text-left text-[2.9rem] leading-[0.92] tracking-tight text-white sm:text-6xl md:text-7xl lg:text-[7.2rem]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                <span className="block">Your missi</span>
                <span className="block">actually</span>
                <span className="mt-2 block min-h-[0.95em] text-white/92" style={{ fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
                  <BlurWord key={`${heroWords[wordIndex]}-${wordIndex}`} word={heroWords[wordIndex]} trigger={wordIndex} />
                </span>
              </h1>
            </Reveal>

            <Reveal delay={0.16} className="mt-10 max-w-2xl">
              <p className="text-base leading-relaxed text-white/62 sm:text-xl lg:text-[1.35rem]">
                Talk naturally. missiAI remembers what matters, keeps context alive, and gives calm, personal support for planning, study, reminders, and everyday life.
              </p>
            </Reveal>

            <Reveal delay={0.24} className="mt-10 flex w-full flex-col items-start gap-4 sm:mt-12 sm:flex-row">
              <Link href="/chat" className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-sm text-black shadow-[0_0_24px_rgba(255,255,255,0.08)] transition-all duration-300 hover:bg-white/90 sm:w-auto sm:text-base">
                <Mic className="h-4 w-4" />
                Start talking to missi
                <CTAArrow dark />
              </Link>
            </Reveal>
            <Reveal delay={0.28} className="mt-3 flex items-center justify-center gap-2 text-xs text-white/45 sm:justify-start" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Free forever — no credit card required
            </Reveal>
          </div>
        </div>

        <Reveal delay={0.35} className={`relative z-10 ${pageShell} pb-10 pt-8 sm:pb-8 sm:pt-10 lg:absolute lg:bottom-12 lg:left-0 lg:right-0`}>
          <div className="grid w-full grid-cols-3 gap-3 sm:flex sm:flex-wrap sm:items-start sm:gap-10 lg:gap-20">
            {[
              { value: "1", label: "remembers everything you share" },
              { value: "40+", label: "languages, accents, naturally" },
              { value: "0ms", label: "feels instant, always on" },
            ].map((stat) => (
              <div key={stat.label} className="flex min-w-0 flex-col gap-1.5 sm:gap-2">
                <span className="text-2xl text-white sm:text-3xl lg:text-4xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  {stat.value}
                </span>
                <span className="max-w-[11ch] text-[11px] leading-[1.35] text-white/50 sm:max-w-none sm:text-xs sm:leading-tight">{stat.label}</span>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section id="memory" className="relative overflow-hidden py-20 sm:py-24 lg:py-32">
        <div className={pageShell}>
          <div className="relative mb-16 sm:mb-24 lg:mb-32">
            <div className="grid items-end gap-6 sm:gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <Reveal>
                  <span className="mb-6 inline-flex items-center text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    Memory
                  </span>
                </Reveal>
                <Reveal delay={0.08}>
                  <h2 className="text-[2.9rem] leading-[0.9] tracking-tight sm:text-6xl md:text-7xl lg:text-[128px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    Context that
                    <br />
                    <span className="text-white/35">stays alive.</span>
                  </h2>
                </Reveal>
              </div>
              <div className="lg:col-span-5 lg:pb-4">
                <Reveal delay={0.16}>
                  <p className="text-base leading-relaxed text-white/55 sm:text-xl">
                    This section mirrors the Agentic reference layout, but the story is missiAI: a companion that keeps the people, plans, moods, and small details that make help actually feel personal.
                  </p>
                </Reveal>
              </div>
            </div>
          </div>

          <Reveal className="grid gap-6 lg:grid-cols-12">
            <div className="group relative flex min-h-[420px] overflow-hidden border border-white/10 bg-black sm:min-h-[500px] lg:col-span-12">
              <div className="relative flex-1 bg-black p-6 sm:p-8 lg:p-12">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(236,168,214,0.14),transparent_34%),radial-gradient(circle_at_44%_76%,rgba(103,232,249,0.1),transparent_26%)]" />
                <div className="relative z-10 max-w-xl">
                  <span className="text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    01
                  </span>
                  <h3 className="mt-4 text-2xl transition-transform duration-500 group-hover:translate-x-2 sm:text-3xl lg:text-4xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    One conversation that keeps deepening.
                  </h3>
                  <p className="mt-5 max-w-md text-base leading-relaxed text-white/58 sm:mt-6 sm:text-lg">
                    missi does not reset every time you come back. It can carry your routines, people, projects, and emotional context forward so the next moment begins with understanding.
                  </p>
                  <div className="mt-10 space-y-4">
                    {[
                      "People, places, and plans stay nearby",
                      "Voice-first capture makes memory feel effortless",
                      "Daily help grows from what already matters to you",
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3 border-t border-white/10 pt-4 text-sm text-white/62 sm:gap-4 sm:text-base">
                        <div className="h-1.5 w-1.5 rounded-full bg-[#eca8d6]" />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-10">
                    <span className="text-4xl sm:text-5xl lg:text-6xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                      1 thread
                    </span>
                    <span className="mt-2 block text-sm text-white/42" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      across voice, reminders, notes, and follow-ups
                    </span>
                  </div>
                </div>
              </div>
              <div className="relative hidden w-[42%] shrink-0 overflow-hidden lg:block">
                <img
                  src="/images/landing/atmospheric-portrait.png"
                  alt="Atmospheric portrait"
                  className="absolute inset-0 h-full w-full object-cover object-center"
                  style={{ transform: "scaleX(-1)" }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="process" className="relative overflow-hidden bg-black py-20 text-white sm:py-24 lg:py-32">
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none" />
        <div className={`relative z-10 ${pageShell}`}>
          <div className="grid items-end gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="overflow-hidden pb-0 lg:pb-32">
              <Reveal>
                <span className="mb-8 inline-flex items-center text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                  Process
                </span>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="text-[2.9rem] leading-[0.85] sm:text-6xl md:text-7xl lg:text-[128px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  Speak.
                  <br />
                  <span className="text-white/35">Save.</span>
                  <br />
                  <span className="text-white/15">Live.</span>
                </h2>
              </Reveal>
            </div>

            <Reveal delay={0.16} className="relative mt-2 h-[220px] overflow-hidden sm:h-[320px] lg:mt-0 lg:h-[680px]">
              <div className="pointer-events-none absolute inset-x-[14%] bottom-[6%] top-[12%] rounded-[42%] bg-[#ec7ca6]/10 blur-[72px]" />
              <img
                src="/images/landing/tree-artwork.png"
                alt="Glowing tree artwork"
                className="absolute -bottom-4 left-0 h-full w-full scale-[1.08] object-contain object-bottom"
                style={featheredPortraitMask}
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-[14%] bg-gradient-to-r from-black via-black/80 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 w-[10%] bg-gradient-to-l from-black via-black/70 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-black via-black/60 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[8%] bg-gradient-to-t from-black via-black/60 to-transparent" />
            </Reveal>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {processSteps.map((step, index) => (
              <button
                key={step.number}
                type="button"
                onMouseEnter={() => setActiveProcess(index)}
                onFocus={() => setActiveProcess(index)}
                onClick={() => setActiveProcess(index)}
                className={`relative border p-6 text-left transition-all duration-500 sm:p-8 lg:p-12 ${
                  activeProcess === index ? "border-white/60 bg-black" : "border-white/20 bg-black hover:border-white/45"
                }`}
              >
                <div className="mb-8 flex items-center gap-4">
                  <span className={`text-3xl transition-colors duration-300 sm:text-4xl ${activeProcess === index ? "text-[#eca8d6]" : "text-white/20"}`} style={{ fontFamily: "'Instrument Serif', serif" }}>
                    {step.number}
                  </span>
                  <div className="h-px flex-1 overflow-hidden bg-white/10">
                    {activeProcess === index ? <div className="h-full bg-[#eca8d6]/50 animate-[missiProgress_5.6s_linear_forwards]" /> : null}
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  {step.title}
                </h3>
                <span className="mb-6 mt-2 block text-lg text-white/40 sm:text-xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  {step.subtitle}
                </span>
                <p className={`text-sm leading-relaxed text-white/60 transition-opacity duration-300 sm:text-base ${activeProcess === index ? "opacity-100" : "opacity-70"}`}>
                  {step.description}
                </p>
                <div className={`absolute bottom-0 left-0 right-0 h-1 origin-left bg-[#eca8d6] transition-transform duration-500 ${activeProcess === index ? "scale-x-100" : "scale-x-0"}`} />
              </button>
            ))}
          </div>
        </div>
      </section>

      <ProductShowcase />

      <section id="presence" className="relative overflow-hidden py-20 sm:py-24 lg:py-40">
        <div className={pageShell}>
          <div className="mb-16 sm:mb-20">
            <Reveal>
              <span className="mb-8 inline-flex items-center text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Daily life
              </span>
            </Reveal>
            <div className="grid items-stretch gap-6 sm:gap-8 lg:grid-cols-[auto_1fr] lg:gap-16">
              <Reveal className="mx-auto w-32 shrink-0 sm:w-48 lg:mx-0 lg:w-72 xl:w-80">
                <img
                  src="/images/landing/orbital-sphere.png"
                  alt="Orbital sphere"
                  className="h-full w-full object-contain object-center"
                />
              </Reveal>
              <div className="flex flex-col justify-center text-center lg:text-left">
                <Reveal delay={0.08}>
                  <h2 className="text-[2.9rem] leading-[0.9] sm:text-6xl md:text-7xl lg:text-[128px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    Present through
                    <br />
                    <span className="text-white/35">the whole day.</span>
                  </h2>
                </Reveal>
                <Reveal delay={0.16}>
                  <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/55 sm:mt-8 sm:text-xl lg:mx-0">
                    missiAI is not just a chat screen. It is meant to show up in the moments where life actually happens: planning, remembering, studying, reflecting, and keeping small promises to yourself.
                  </p>
                </Reveal>
              </div>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <Reveal className="relative overflow-hidden border border-white/10 bg-white/[0.02] p-6 sm:p-8 lg:col-span-7 lg:p-12">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(236,168,214,0.12),transparent_26%),radial-gradient(circle_at_68%_70%,rgba(103,232,249,0.08),transparent_28%)]" />
              <div className="relative z-10">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                  <span className="text-5xl leading-none sm:text-7xl lg:text-[9rem]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    24/7
                  </span>
                  <span className="text-lg text-white/45 sm:text-2xl">presence</span>
                </div>
                <p className="max-w-md text-sm text-white/58 sm:text-base">
                  A calmer companion works best when it can stay consistent across voice, notes, reminders, study sessions, and quiet check-ins.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.08} className="flex flex-col justify-between border border-white/10 bg-white/[0.02] p-6 sm:p-8 lg:col-span-5">
              <span className="text-xs uppercase tracking-[0.22em] text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Daily rhythm
              </span>
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-[#eca8d6]" />
                  <span className="text-sm text-white/70">Morning briefs</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-[#67e8f9]" />
                  <span className="text-sm text-white/70">Study sessions</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-[#a78bfa]" />
                  <span className="text-sm text-white/70">Evening reflection</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-white/20" />
                  <span className="text-sm text-white/45">Quiet standby</span>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal delay={0.16} className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {presenceModes.map((mode, index) => (
              <div
                key={mode.title}
                className={`cursor-default border p-5 transition-all duration-300 sm:p-6 ${
                  activePresence === index ? "border-white/30 bg-white/[0.04]" : "border-white/10"
                }`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full transition-colors ${activePresence === index ? "bg-[#eca8d6]" : "bg-white/20"}`} />
                  <span className="text-xs uppercase tracking-[0.24em] text-white/38" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    active
                  </span>
                </div>
                <span className="mb-2 block font-medium text-white">{mode.title}</span>
                <span className="text-sm text-white/50">{mode.description}</span>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="relative overflow-hidden pb-20 pt-24 sm:pb-24 sm:pt-28 lg:pb-40 lg:pt-48">
        <GridBackground />

        <div className={`relative z-10 ${pageShell}`}>
          <div className="mb-16 grid gap-6 sm:gap-8 lg:mb-32 lg:grid-cols-12">
            <div className="lg:col-span-8 lg:col-start-1">
              <Reveal>
                <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <span className="flex items-center gap-2 bg-[#eca8d6]/10 px-3 py-1 text-xs text-[#eca8d6]" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span className="h-2 w-2 rounded-full bg-[#eca8d6] animate-pulse" />
                    LIVE FEEL
                  </span>
                  <span className="text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    designed for natural daily use
                  </span>
                </div>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="text-[2.9rem] leading-[0.95] sm:text-6xl md:text-7xl lg:text-[140px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                  Real-time
                  <br />
                  <span className="text-white/35">companion feel.</span>
                </h2>
              </Reveal>
            </div>
          </div>
        </div>

        <Reveal delay={0.16} className="relative w-full overflow-hidden">
          <div className="pointer-events-none absolute inset-x-[6%] bottom-[4%] top-[6%] rounded-[42%] bg-[#eca8d6]/10 blur-[96px]" />
          <img
            src="/images/landing/realtime-graph.png"
            alt="Organic graph artwork"
            className="relative z-10 h-auto w-full scale-[1.06] object-cover"
            style={featheredLandscapeMask}
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[5%] bg-gradient-to-r from-black to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[5%] bg-gradient-to-l from-black to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[8%] bg-gradient-to-b from-black via-black/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-t from-black via-black/85 to-transparent" />
        </Reveal>

        <div className={`relative z-10 ${pageShell}`}>
          <div className="relative z-10 -mt-6 grid gap-4 sm:-mt-8 lg:-mt-14 lg:grid-cols-3">
            {[
              {
                delay: 0,
                eyebrow: "memory that keeps building",
                title: "continuous memory thread",
                value: <AnimatedCounter end={1} />,
                note: "across voice, notes, reminders, and follow-up context",
                accent: false,
              },
              {
                delay: 0.08,
                eyebrow: "understands every language",
                title: "language flexibility",
                value: "all",
                note: "across languages, accents, and the way people naturally speak worldwide",
                accent: true,
              },
              {
                delay: 0.16,
                eyebrow: "fast enough to stay natural",
                title: "voice response feel",
                value: <AnimatedCounter end={200} prefix="<" suffix="ms" />,
                note: "quick enough to keep the conversation fluid instead of feeling delayed",
                accent: false,
              },
            ].map((card) => (
              <Reveal
                key={card.title}
                delay={card.delay}
                className="flex min-h-[270px] flex-col justify-between gap-6 border border-white/10 bg-white/[0.02] p-6 sm:min-h-[300px] sm:p-8 lg:p-10"
              >
                <div className="w-full">
                  <div className="mb-2 text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {card.eyebrow}
                  </div>
                  <div className="mb-3 text-base text-white">{card.title}</div>
                  <DotGraph accent={card.accent} height={24} />
                </div>
                <div>
                  <div className="text-2xl tracking-tight sm:text-3xl md:text-4xl lg:text-5xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    {card.value}
                  </div>
                  <div className="mt-2 text-sm leading-relaxed text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    {card.note}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.24} className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-white/10 pt-6 text-sm text-white/45 sm:mt-16 sm:gap-x-12 sm:gap-y-4 sm:pt-8" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
            <span>Voice chat</span>
            <span>Daily briefs</span>
            <span>Reminders</span>
            <span>Notes</span>
            <span>Budget Buddy</span>
            <span className="text-white">Exam Buddy</span>
          </Reveal>
        </div>
      </section>

      <section id="tools" className="relative overflow-hidden pb-6 sm:pb-8 lg:pb-0">
        <div className="relative z-10 px-5 pt-20 text-center sm:px-6 sm:pt-24 lg:px-0 lg:pt-40">
          <Reveal>
            <span className="mb-8 inline-flex items-center justify-center text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Tools
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-[2.9rem] leading-[0.9] sm:text-6xl md:text-7xl lg:text-[128px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
              Connected to
              <br />
              <span className="text-white/35">your daily stack.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/55 sm:mt-8 sm:text-xl">
              missiAI is not just memory for memory&apos;s sake. It connects that context to the tools and moments that keep a real day moving.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="relative mt-8 w-full overflow-hidden sm:mt-10 lg:mt-0">
          <div className="pointer-events-none absolute inset-x-[6%] bottom-[4%] top-[6%] rounded-[44%] bg-[#ff876e]/12 blur-[104px]" />
          <img
            src="/images/landing/connection-artwork.png"
            alt="Connection artwork"
            className="relative z-10 h-auto w-full scale-[1.06] object-cover"
            style={featheredLandscapeMask}
          />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[5%] bg-gradient-to-r from-black to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[5%] bg-gradient-to-l from-black to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[8%] bg-gradient-to-b from-black via-black/70 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[12%] bg-gradient-to-t from-black via-black/85 to-transparent" />
        </Reveal>

        <div className={`relative z-10 ${pageShell} mt-4 sm:mt-6 lg:-mt-20`}>
          <div className="mb-12 grid grid-cols-1 gap-4 sm:mb-16 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {toolCards.map((tool, index) => {
              const Icon = tool.icon
              const isHovered = hoveredTool === index

              return (
                <div
                  key={tool.name}
                  className={`group relative cursor-default overflow-hidden border p-6 transition-all duration-500 lg:p-8 ${
                    isHovered ? "scale-[1.02] border-white bg-white/[0.04]" : "border-white/10 hover:border-white/30"
                  }`}
                  onMouseEnter={(event) => {
                    setHoveredTool(index)
                    const rect = event.currentTarget.getBoundingClientRect()
                    setMousePosition({ x: event.clientX - rect.left, y: event.clientY - rect.top })
                  }}
                  onMouseMove={(event) => {
                    const rect = event.currentTarget.getBoundingClientRect()
                    setMousePosition({ x: event.clientX - rect.left, y: event.clientY - rect.top })
                  }}
                  onMouseLeave={() => {
                    setHoveredTool(null)
                    setMousePosition(null)
                  }}
                >
                  {isHovered && mousePosition ? (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 z-0"
                      style={{
                        background: `radial-gradient(200px circle at ${mousePosition.x}px ${mousePosition.y}px, rgba(255,255,255,0.1) 0%, transparent 70%)`,
                      }}
                    />
                  ) : null}
                  <span
                    className={`absolute right-3 top-3 px-2 py-0.5 text-[10px] transition-colors ${
                      isHovered ? "bg-white text-black" : "bg-white/10 text-white/45"
                    }`}
                    style={{ fontFamily: "'JetBrains Mono', monospace" }}
                  >
                    {tool.category}
                  </span>
                  <div className={`mb-6 flex h-10 w-10 items-center justify-center transition-colors ${isHovered ? "text-white" : "text-white/60"}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="relative z-10 block font-medium text-white">{tool.name}</span>
                  <div className="absolute bottom-0 left-0 right-0 h-px overflow-hidden bg-white/20">
                    <div className={`h-full bg-white transition-all duration-500 ${isHovered ? "w-full" : "w-0"}`} />
                  </div>
                </div>
              )
            })}
          </div>

          <Reveal delay={0.28} className="flex flex-col items-start justify-between gap-6 border-t border-white/10 pb-20 pt-8 sm:gap-8 sm:pt-12 lg:flex-row lg:items-center lg:pb-40">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:gap-12">
              {[
                { value: "Voice", label: "conversation-first" },
                { value: "Memory", label: "context-native" },
                { value: "Daily", label: "real-life support" },
              ].map((stat) => (
                <div key={stat.label} className="flex items-baseline gap-3">
                  <span className="text-3xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    {stat.value}
                  </span>
                  <span className="text-sm text-white/45">{stat.label}</span>
                </div>
              ))}
            </div>
            <Link href="/chat" className="group inline-flex items-center gap-2 text-sm text-white/45 transition-colors hover:text-white" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              Open missi now
              <CTAArrow />
            </Link>
          </Reveal>
        </div>
      </section>

      <section id="trust" className="relative overflow-hidden py-20 sm:py-24 lg:py-40">
        <div className={pageShell}>
          <div className="mb-16 sm:mb-20">
            <Reveal>
              <span className="mb-8 inline-flex items-center text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                Trust
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mb-8 text-[2.9rem] leading-[0.9] sm:mb-12 sm:text-6xl md:text-7xl lg:text-[128px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                Personal,
                <br />
                <span className="text-white/35">not intrusive.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="max-w-2xl text-base leading-relaxed text-white/55 sm:text-xl">
                A memory product only works if it feels safe. missiAI should be warm, capable, and private at the same time.
              </p>
            </Reveal>
          </div>

          <div className="grid gap-6 lg:grid-cols-12">
            <Reveal className="relative min-h-[420px] overflow-hidden border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] lg:col-span-7 p-6 sm:min-h-[440px] sm:p-8 lg:p-12">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_16%,rgba(236,168,214,0.16),transparent_24%),radial-gradient(circle_at_72%_70%,rgba(103,232,249,0.12),transparent_28%)]" />
              <Shield className="absolute bottom-6 right-6 h-24 w-24 text-white/[0.05] sm:bottom-10 sm:right-10 sm:h-32 sm:w-32 lg:h-40 lg:w-40" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <span className="text-sm uppercase tracking-[0.22em] text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    Control
                  </span>
                  <h3 className="mt-5 max-w-[9ch] text-4xl leading-[0.92] sm:mt-6 sm:text-5xl md:text-6xl lg:text-7xl" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    You stay in control.
                  </h3>
                  <p className="mt-5 max-w-lg text-base leading-relaxed text-white/56 sm:mt-6 sm:text-lg">
                    Memory should stay editable, understandable, and permission-led — useful when invited, quiet when not.
                  </p>
                </div>
                <div className="mt-8 grid gap-4 sm:mt-12 sm:grid-cols-2 lg:max-w-[85%]">
                  {[
                    { label: "Review before trust", value: "Editable memory" },
                    { label: "Boundaries first", value: "Permission aware" },
                  ].map((item) => (
                    <div key={item.label} className="border border-white/10 bg-black/20 p-4">
                      <span className="block text-[11px] uppercase tracking-[0.22em] text-white/35" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.label}
                      </span>
                      <span className="mt-2 block text-lg text-white">{item.value}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-10 flex flex-wrap gap-2">
                  {[
                    "Encrypted",
                    "Delete anytime",
                    "Reviewable context",
                    "Permission aware",
                  ].map((badge, index) => (
                    <span
                      key={badge}
                      className="border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/52"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        transitionDelay: `${index * 100}ms`,
                      }}
                    >
                      {badge}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>

            <div className="flex flex-col gap-4 lg:col-span-5">
              {trustFeatures.map((feature, index) => {
                const Icon = feature.icon
                return (
                  <Reveal key={feature.title} delay={0.08 + index * 0.06}>
                    <div className="flex flex-col gap-3 border border-white/10 bg-white/[0.02] p-5 sm:p-6 transition-colors hover:border-white/15">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-white/15 bg-white/[0.03]">
                          <Icon className="h-4 w-4 text-white/70" />
                        </div>
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/40" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                          {feature.label}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-white">{feature.title}</h3>
                      <p className="text-sm leading-relaxed text-white/50">{feature.description}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden py-20 sm:py-24 lg:py-32">
        <div className={pageShell}>
          <Reveal>
            <div className="relative overflow-hidden border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] transition-all duration-1000">
              <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(600px_circle_at_18%_28%,rgba(255,255,255,0.18),transparent_42%)]" />
              <div className="relative z-10 grid gap-8 px-6 py-10 sm:gap-12 sm:px-8 sm:py-16 lg:grid-cols-12 lg:px-16 lg:py-20">
                <div className="lg:col-span-7">
                  <span className="inline-flex items-center text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    Begin
                  </span>
                  <h2 className="mt-6 text-[2.6rem] leading-[0.95] sm:mt-8 sm:text-5xl md:text-6xl lg:text-[72px]" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    Ready to live
                    <br />
                    with missi?
                  </h2>
                  <p className="mt-6 max-w-xl text-base leading-relaxed text-white/58 sm:mt-8 sm:text-xl">
                    Start with voice. Let memory build quietly over time. Keep missi close for planning, reminders, study, and the small moments where support matters most.
                  </p>
                  <div className="mt-8 flex flex-col items-start gap-4 sm:mt-10 sm:flex-row">
                    <Link href="/chat" className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-sm text-black transition-colors hover:bg-white/90 sm:w-auto sm:text-base">
                      <Mic className="h-4 w-4" />
                      Start talking to missi
                      <CTAArrow dark />
                    </Link>
                    <Link href="/manifesto" className="inline-flex h-14 w-full items-center justify-center rounded-full border border-white/20 px-8 text-sm text-white/80 transition-colors hover:bg-white/5 hover:text-white sm:w-auto sm:text-base">
                      Read the manifesto
                    </Link>
                  </div>
                  <p className="mt-4 flex items-center gap-2 text-xs text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Free forever — no credit card required
                  </p>
                  <p className="mt-4 text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                    Voice, memory, reminders, Budget Buddy, and Exam Buddy in one system
                  </p>
                </div>
                <div className="hidden lg:col-span-5 lg:block">
                  <div className="relative min-h-[420px] overflow-hidden border border-white/10 bg-black/30">
                    <img
                      src="/images/landing/connection-artwork.png"
                      alt="Connection artwork"
                      className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-85"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/10" />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />
                    <div className="absolute bottom-6 left-6">
                      <span className="text-xs uppercase tracking-[0.24em] text-white/38" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                        Always nearby
                      </span>
                      <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/60">
                        One companion for voice, memory, and the everyday follow-through that makes AI useful.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute right-0 top-0 h-32 w-32 border-b border-l border-white/10" />
              <div className="absolute bottom-0 left-0 h-32 w-32 border-r border-t border-white/10" />
            </div>
          </Reveal>
        </div>
      </section>

      <section className="relative overflow-hidden py-16 sm:py-20 lg:py-24">
        <div className={pageShell}>
          <div className="mb-10 text-center">
            <Reveal>
              <span className="inline-flex items-center text-sm text-white/45" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                People talking to missi
              </span>
            </Reveal>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                quote: "I started using missi for reminders, but now I journal, plan my week, and vent when I need to. It actually remembers what I care about.",
                name: "Priya K.",
                role: "Engineering student",
              },
              {
                quote: "The voice chat feels like talking to someone who actually listened. Not a chatbot — someone who gets my context.",
                name: "Marcus T.",
                role: "Product designer",
              },
              {
                quote: "Budget Buddy caught spending I did not even notice. Exam Buddy turned my weak topics into a study plan. Both just work.",
                name: "Aisha R.",
                role: "Graduate student",
              },
            ].map((t, i) => (
              <Reveal key={t.name} delay={i * 0.08}>
                <div className="flex h-full flex-col justify-between border border-white/10 bg-white/[0.02] p-6 transition-colors hover:border-white/20 sm:p-8">
                  <p className="text-base leading-relaxed text-white/70" style={{ fontFamily: "'Instrument Serif', serif" }}>
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xs text-white/60">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm text-white/80">{t.name}</p>
                      <p className="text-xs text-white/40">{t.role}</p>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative bg-black">
        <div className="relative h-[120px] w-full overflow-hidden sm:h-[340px] md:h-[420px]">
          <img
            src="/images/landing/footer-landscape.png"
            alt="Bioluminescent landscape"
            className="h-full w-full object-cover object-center"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40" />
        </div>

        <div className={`relative z-10 ${pageShell}`}>
          <div className="py-10 sm:py-16 lg:py-20">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-12 md:grid-cols-5 lg:gap-8">
              <div className="sm:col-span-2">
                <div className="mb-6 inline-flex items-center select-none">
                  <div className="flex items-center gap-2">
                    <Image src="/missi-m.png" alt="" width={28} height={28} className="h-5 w-auto object-contain sm:h-6" />
                    <LEDLogo className="w-[84px] sm:w-[90px] justify-start" />
                  </div>
                </div>
                <p className="mb-6 max-w-xs text-sm leading-relaxed text-white/50 sm:mb-8">
                  Voice-first personal AI with memory. Built to help with planning, remembering, studying, reflecting, and staying present in daily life.
                </p>
                <div className="flex flex-wrap gap-3 sm:gap-6">
                  {[
                    { name: "GitHub", href: "https://github.com/rudrasatani13/missiAI" },
                    { name: "Manifesto", href: "/manifesto" },
                    { name: "Chat", href: "/chat" },
                  ].map((link) => (
                    <Link key={link.name} href={link.href} className="group inline-flex items-center gap-1 text-sm text-white/40 transition-colors hover:text-white">
                      {link.name}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-6 sm:col-span-2 md:col-span-3 md:grid-cols-3 lg:gap-8">
                {Object.entries(footerLinks).map(([title, links]) => (
                  <div key={title}>
                    <h3 className="mb-4 text-sm font-medium text-white sm:mb-6">{title}</h3>
                    <ul className="space-y-3 sm:space-y-4">
                      {links.map((link) => (
                        <li key={link.name}>
                          <Link href={link.href} className="inline-flex items-center gap-2 text-sm text-white/40 transition-colors hover:text-white">
                            {link.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-4 border-t border-white/10 py-6 text-left sm:py-8 md:flex-row md:items-center">
            <p className="text-sm text-white/30">&copy; {new Date().getFullYear()} missiAI. All rights reserved.</p>
            <div className="flex items-center gap-4 text-sm text-white/30">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-[#eca8d6]" />
                Memory system online
              </span>
            </div>
          </div>
        </div>
      </footer>

      <CookieConsent />

      <style jsx global>{`
        body.landing-homepage [data-testid="global-footer"] {
          display: none !important;
        }

        body.landing-homepage .missi-cta-arrow {
          display: inline-block;
          position: relative;
          flex-shrink: 0;
          width: 14px;
          height: 14px;
          margin-left: 2px;
          opacity: 1 !important;
          transform: translateX(0);
          transition: transform 0.2s ease;
        }

        body.landing-homepage .missi-cta-arrow::before,
        body.landing-homepage .missi-cta-arrow::after {
          content: "";
          position: absolute;
          display: block;
          background: currentColor;
          border-radius: 999px;
          opacity: 1 !important;
        }

        body.landing-homepage .missi-cta-arrow::before {
          left: 1px;
          top: 6px;
          width: 11px;
          height: 2px;
        }

        body.landing-homepage .missi-cta-arrow::after {
          right: 1px;
          top: 3px;
          width: 7px;
          height: 2px;
          transform: rotate(45deg);
          transform-origin: right center;
          box-shadow: 0 4px 0 0 currentColor;
        }

        body.landing-homepage .group:hover .missi-cta-arrow {
          transform: translateX(4px);
        }

        body.landing-homepage .fixed.rounded-full.pointer-events-none[class*="z-[9999]"] {
          display: none !important;
          visibility: hidden !important;
        }

        @keyframes missiProgress {
          from {
            width: 0%;
          }

          to {
            width: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          body.landing-homepage *,
          body.landing-homepage *::before,
          body.landing-homepage *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </main>
  )
}
