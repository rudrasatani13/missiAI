"use client"

import { type ComponentType, type CSSProperties, type ReactNode, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
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
import { LEDLogo } from "@/components/brand/LEDLogo"
import Image from "next/image"
import { CookieConsent } from "@/components/feedback/CookieConsent"
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

function Reveal({ children, className = "", delay = 0, style }: { children: ReactNode; className?: string; delay?: number; style?: CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28, filter: "blur(10px)" }}
      whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.14 }}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
      style={style}
    >
      {children}
    </motion.div>
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

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={trigger}
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={{
          visible: {
            transition: { staggerChildren: 0.048 }
          },
          hidden: {}
        }}
        className="inline-flex"
      >
        {letters.map((char, index) => (
          <motion.span
            key={index}
            variants={{
              hidden: { opacity: 0, filter: "blur(18px)" },
              visible: { opacity: 1, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } }
            }}
            className="font-serif italic tracking-tight text-[#eca8d6]"
          >
            {char === " " ? "\u00A0" : char}
          </motion.span>
        ))}
      </motion.div>
    </AnimatePresence>
  )
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
                  
                >
                  Sign in
                </Link>
                <Link
                  href="/sign-up"
                  className={`rounded-full bg-white text-black transition-all duration-500 ${
                    isScrolled ? "px-4 h-8 text-xs inline-flex items-center" : "px-6 py-3 text-sm inline-flex items-center"
                  }`}
                  
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
        {/* Close button — matches hamburger style exactly */}
        <button
          type="button"
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute right-4 top-4 p-2 text-white transition-colors"
          aria-label="Close menu"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="flex h-full flex-col overflow-y-auto px-5 pb-6 pt-24 sm:px-8 sm:pb-8 sm:pt-28">
          <div className="flex flex-1 flex-col justify-center gap-6 sm:gap-8">
            {navLinks.map((link, index) => (
              <a
                key={link.name}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`text-[2.5rem] leading-none text-white transition-all duration-500 sm:text-5xl font-serif ${
                  isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
                }`}
                style={{ transitionDelay: isMobileMenuOpen ? `${index * 75}ms` : "0ms" }}
              >
                {link.name}
              </a>
            ))}
          </div>
          <div
            className={`flex flex-col gap-4 border-t border-white/10 pt-6 transition-all duration-500 ${
              isMobileMenuOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
            }`}
            style={{ transitionDelay: isMobileMenuOpen ? "260ms" : "0ms", paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
          >
            <Link
              href={isLoaded && isSignedIn ? "/chat" : "/sign-in"}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex w-full items-center justify-center rounded-full border border-white/20 bg-white/[0.06] py-5 text-xl font-medium text-white active:scale-[0.98]"
              
            >
              {isLoaded && isSignedIn ? "Open missi" : "Sign in"}
            </Link>
            <Link
              href={isLoaded && isSignedIn ? "/chat" : "/sign-up"}
              onClick={() => setIsMobileMenuOpen(false)}
              className="flex w-full items-center justify-center rounded-full bg-white py-5 text-xl font-semibold text-black shadow-[0_8px_32px_rgba(255,255,255,0.18)] active:scale-[0.98]"
              
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


  // activeTrust auto-cycler removed — cards now use consistent static styling

  useEffect(() => {
    document.body.classList.add("landing-homepage")
    return () => document.body.classList.remove("landing-homepage")
  }, [])

  if (!isLoaded || isSignedIn) {
    return <div className="min-h-screen bg-black" style={{ backgroundColor: "#000000" }} />
  }

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-black text-white" >  
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

        <div className={`relative z-10 ${pageShell} flex flex-1 flex-col justify-between pb-28 pt-28 sm:min-h-[100svh] sm:pb-20 sm:pt-36 lg:min-h-screen lg:justify-center lg:pb-36 lg:pt-40`}>
          {/* Headline — top of hero */}
          <div className="w-full max-w-[28rem] sm:max-w-2xl lg:max-w-[58%]">
            <Reveal delay={0.08} className="mt-2 sm:mt-4">
              <h1 className="text-left tracking-tight text-white font-serif">
                <span className="block text-[2.4rem] leading-[1.05] text-white/60 sm:text-5xl md:text-6xl lg:text-[5rem]">Your personal AI</span>
                <span className="mt-1 block text-[3.4rem] leading-[0.92] sm:text-7xl md:text-8xl lg:text-[7.8rem]">
                  <BlurWord key={`${heroWords[wordIndex]}-${wordIndex}`} word={heroWords[wordIndex]} trigger={wordIndex} />
                </span>
              </h1>
            </Reveal>

            <Reveal delay={0.16} className="mt-6 max-w-lg">
              <p className="text-base leading-relaxed text-gray-400 sm:text-lg">
                A personal companion designed to stay in sync with your life.
              </p>
            </Reveal>

            {/* Desktop-only inline CTA */}
            <Reveal delay={0.24} className="mt-10 hidden sm:flex w-full flex-col items-start gap-4 sm:mt-12 sm:flex-row">
              <Link href="/chat" className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-sm text-black shadow-[0_0_24px_rgba(255,255,255,0.08)] transition-all duration-300 hover:bg-white/90 sm:w-auto sm:text-base">
                <Mic className="h-4 w-4" />
                Start talking to missi
                <CTAArrow dark />
              </Link>
            </Reveal>
          </div>

          {/* Missi identity + social proof — fills the dead zone on mobile */}
          <Reveal delay={0.32} className="mt-auto pt-8 sm:hidden">
            {/* Identity chips */}
            <div className="mb-5 flex flex-wrap gap-2">
              {[
                { label: "Voice chat", icon: Mic },
                { label: "Memory", icon: BrainCircuit },
                { label: "Reminders", icon: Bell },
                { label: "Exam Buddy", icon: GraduationCap },
                { label: "Budget Buddy", icon: Wallet },
              ].map((chip) => {
                const Icon = chip.icon
                return (
                  <span
                    key={chip.label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70 backdrop-blur-sm"
                  >
                    <Icon className="h-3 w-3" />
                    {chip.label}
                  </span>
                )
              })}
            </div>
            {/* Social proof */}
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {["P", "M", "A", "R"].map((initial) => (
                  <div key={initial} className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[10px] text-white/70">
                    {initial}
                  </div>
                ))}
              </div>
              <p className="text-xs text-white/60 font-mono">
                500+ students & professionals
              </p>
            </div>
          </Reveal>
        </div>

        {/* Mobile-only fixed bottom CTA */}
        <Reveal delay={0.24} className="sm:hidden fixed bottom-0 left-0 right-0 z-20 px-5 pb-8 pt-4 bg-gradient-to-t from-black via-black/90 to-transparent">
          <Link href="/chat" className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-white px-8 text-sm text-black shadow-[0_8px_32px_rgba(255,255,255,0.15)] transition-all duration-300 active:scale-[0.98]">
            <Mic className="h-4 w-4" />
            Start talking to missi
            <CTAArrow dark />
          </Link>
        </Reveal>
      </section>

      <section id="process" className="relative overflow-hidden bg-black py-20 text-white sm:py-24 lg:py-32">
        <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-white/[0.02] blur-[100px] pointer-events-none" />
        <div className={`relative z-10 ${pageShell}`}>
          <div className="grid items-end gap-8 lg:grid-cols-2 lg:gap-12">
            <div className="overflow-hidden pb-0 lg:pb-32">
              <Reveal>
                <span className="mb-8 inline-flex items-center text-sm text-white/60 font-mono">
                  Process
                </span>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="text-[2.9rem] leading-[0.85] sm:text-6xl md:text-7xl lg:text-[128px] font-serif">
                  Speak.
                  <br />
                  <span className="text-white/60">Save.</span>
                  <br />
                  <span className="text-white/15">Live.</span>
                </h2>
              </Reveal>
            </div>

            <Reveal delay={0.16} className="relative mt-2 h-[220px] overflow-hidden sm:h-[320px] lg:mt-0 lg:h-[680px]">
              <div className="pointer-events-none absolute inset-x-[14%] bottom-[6%] top-[12%] rounded-[42%] bg-[#ec7ca6]/10 blur-[72px]" />
              <Image src="/images/landing/tree-artwork.png" alt="Glowing tree artwork" className="absolute -bottom-4 left-0 h-full w-full scale-[1.08] object-contain object-bottom" style={featheredPortraitMask} fill sizes="100vw" />
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
                  <span className={`text-3xl transition-colors duration-300 sm:text-4xl ${activeProcess === index ? "text-[#eca8d6]" : "text-white/20"} font-serif`}>
                    {step.number}
                  </span>
                  <div className="h-px flex-1 overflow-hidden bg-white/10">
                    {activeProcess === index ? <div className="h-full bg-[#eca8d6]/50 animate-[missiProgress_5.6s_linear_forwards]" /> : null}
                  </div>
                </div>
                <h3 className="text-2xl sm:text-3xl lg:text-4xl font-serif">
                  {step.title}
                </h3>
                <span className="mb-6 mt-2 block text-lg text-white/60 sm:text-xl font-serif">
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


      <section className="relative z-20 flex justify-center pb-12 pt-6 sm:pb-24 sm:pt-12">
        <Reveal delay={0.1}>
          <Link href="/chat" className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-white px-8 text-sm font-medium text-black shadow-[0_0_24px_rgba(255,255,255,0.08)] transition-all duration-300 hover:bg-white/90 sm:text-base">
            <Mic className="h-4 w-4" />
            Try missi for free
            <CTAArrow dark />
          </Link>
        </Reveal>
      </section>

      <section id="memory" className="relative overflow-hidden py-20 sm:py-24 lg:py-32">
        <div className={pageShell}>
          <div className="relative mb-16 sm:mb-24 lg:mb-32">
            <div className="grid items-end gap-6 sm:gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <Reveal>
                  <span className="mb-6 inline-flex items-center text-sm text-white/60 font-mono">
                    Memory
                  </span>
                </Reveal>
                <Reveal delay={0.08}>
                  <h2 className="text-[2.9rem] leading-[0.9] tracking-tight sm:text-6xl md:text-7xl lg:text-[128px] font-serif">
                    Context that
                    <br />
                    <span className="text-white/60">stays alive.</span>
                  </h2>
                </Reveal>
              </div>
              <div className="lg:col-span-5 lg:pb-4">
                <Reveal delay={0.16}>
                  <p className="text-base leading-relaxed text-white/70 sm:text-xl">
                    Every interaction with missi builds a lasting context. People, plans, moods, and the small details that make up your day are preserved so your personal AI can offer help that actually feels personal.
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
                  <span className="text-sm text-white/60 font-mono">
                    01
                  </span>
                  <h3 className="mt-4 text-2xl transition-transform duration-500 group-hover:translate-x-2 sm:text-3xl lg:text-4xl font-serif">
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
                    <span className="text-4xl sm:text-5xl lg:text-6xl font-serif">
                      1 thread
                    </span>
                    <span className="mt-2 block text-sm text-white/60 font-mono">
                      across voice, reminders, notes, and follow-ups
                    </span>
                  </div>
                </div>
              </div>
              <div className="relative hidden w-[42%] shrink-0 overflow-hidden lg:block">
                <Image
                  src="/images/landing/atmospheric-portrait.png"
                  alt="Atmospheric portrait"
                  className="object-cover object-center"
                  fill
                  sizes="(max-width: 1024px) 0vw, 42vw"
                  style={{ transform: "scaleX(-1)" }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black via-transparent to-transparent" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section id="trust" className="relative overflow-hidden py-20 sm:py-24 lg:py-40">
        <div className={pageShell}>
          <div className="mb-16 sm:mb-20">
            <Reveal>
              <span className="mb-8 inline-flex items-center text-sm text-white/60 font-mono">
                Trust
              </span>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mb-8 text-[2.9rem] leading-[0.9] sm:mb-12 sm:text-6xl md:text-7xl lg:text-[128px] font-serif">
                Personal,
                <br />
                <span className="text-white/60">not intrusive.</span>
              </h2>
            </Reveal>
            <Reveal delay={0.16}>
              <p className="max-w-2xl text-base leading-relaxed text-white/70 sm:text-xl">
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
                  <span className="text-sm uppercase tracking-[0.22em] text-white/60 font-mono">
                    Control
                  </span>
                  <h3 className="mt-5 max-w-[9ch] text-4xl leading-[0.92] sm:mt-6 sm:text-5xl md:text-6xl lg:text-7xl font-serif">
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
                      <span className="block text-[11px] uppercase tracking-[0.22em] text-white/60 font-mono">
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
                      className="border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-white/52 font-mono"
                      style={{
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
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/60 font-mono">
                          {feature.label}
                        </span>
                      </div>
                      <h3 className="text-lg font-medium text-white">{feature.title}</h3>
                      <p className="text-sm leading-relaxed text-white/70">{feature.description}</p>
                    </div>
                  </Reveal>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="tools" className="relative overflow-hidden pb-6 sm:pb-8 lg:pb-0">
        <div className="relative z-10 px-5 pt-20 text-center sm:px-6 sm:pt-24 lg:px-0 lg:pt-40">
          <Reveal>
            <span className="mb-8 inline-flex items-center justify-center text-sm text-white/60 font-mono">
              Tools
            </span>
          </Reveal>
          <Reveal delay={0.08}>
            <h2 className="text-[2.9rem] leading-[0.9] sm:text-6xl md:text-7xl lg:text-[128px] font-serif">
              Connected to
              <br />
              <span className="text-white/60">your daily stack.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.16}>
            <p className="mx-auto mt-6 max-w-lg text-base leading-relaxed text-white/70 sm:mt-8 sm:text-xl">
              missiAI is not just memory for memory&apos;s sake. It connects that context to the tools and moments that keep a real day moving.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.2} className="relative mt-8 w-full overflow-hidden sm:mt-10 lg:mt-0">
          <div className="pointer-events-none absolute inset-x-[6%] bottom-[4%] top-[6%] rounded-[44%] bg-[#ff876e]/12 blur-[104px]" />
          <Image src="/images/landing/connection-artwork.png" alt="Connection artwork" width={1800} height={873} className="relative z-10 h-auto w-full scale-[1.06] object-cover" style={featheredLandscapeMask} sizes="100vw" />
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
                      isHovered ? "bg-white text-black" : "bg-white/10 text-white/60"
                    } font-mono`}
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
                  <span className="text-3xl font-serif">
                    {stat.value}
                  </span>
                  <span className="text-sm text-white/60">{stat.label}</span>
                </div>
              ))}
            </div>
            <Link href="/chat" className="group inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white font-mono">
              Open missi now
              <CTAArrow />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="relative overflow-hidden py-20 sm:py-24 lg:py-32">
        <div className={pageShell}>
          <Reveal>
            <div className="relative overflow-hidden border border-white/12 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))] transition-all duration-1000">
              <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(600px_circle_at_18%_28%,rgba(255,255,255,0.18),transparent_42%)]" />
              <div className="relative z-10 grid gap-8 px-6 py-10 sm:gap-12 sm:px-8 sm:py-16 lg:grid-cols-12 lg:px-16 lg:py-20">
                <div className="lg:col-span-7">
                  <span className="inline-flex items-center text-sm text-white/60 font-mono">
                    Begin
                  </span>
                  <h2 className="mt-6 text-[2.6rem] leading-[0.95] sm:mt-8 sm:text-5xl md:text-6xl lg:text-[72px] font-serif">
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
                  <p className="mt-4 flex items-center gap-2 text-xs text-white/60 font-mono">
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Free forever — no credit card required
                  </p>
                  <p className="mt-4 text-sm text-white/60 font-mono">
                    Voice, memory, reminders, Budget Buddy, and Exam Buddy in one system
                  </p>
                </div>
                <div className="hidden lg:col-span-5 lg:block">
                  <div className="relative min-h-[420px] overflow-hidden border border-white/10 bg-black/30">
                    <Image src="/images/landing/connection-artwork.png" alt="Connection artwork" className="absolute inset-0 h-full w-full scale-110 object-cover object-center opacity-85" fill sizes="100vw" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-transparent to-black/10" />
                    <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black to-transparent" />
                    <div className="absolute bottom-6 left-6">
                      <span className="text-xs uppercase tracking-[0.24em] text-white/60 font-mono">
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
              <span className="inline-flex items-center text-sm text-white/60 font-mono">
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
                  <p className="text-base leading-relaxed text-white/70 font-serif">
                    &ldquo;{t.quote}&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 bg-white/5 text-xs text-white/60">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm text-white/80">{t.name}</p>
                      <p className="text-xs text-white/60">{t.role}</p>
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
          <Image src="/images/landing/footer-landscape.png" alt="Bioluminescent landscape" className="h-full w-full object-cover object-center" fill sizes="100vw" />
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
                <p className="mb-6 max-w-xs text-sm leading-relaxed text-white/70 sm:mb-8">
                  Voice-first personal AI with memory. Built to help with planning, remembering, studying, reflecting, and staying present in daily life.
                </p>
                <div className="flex flex-wrap gap-3 sm:gap-6">
                  {[
                    { name: "GitHub", href: "https://github.com/rudrasatani13/missiAI" },
                    { name: "Manifesto", href: "/manifesto" },
                    { name: "Chat", href: "/chat" },
                  ].map((link) => (
                    <Link key={link.name} href={link.href} className="group inline-flex items-center gap-1 text-sm text-white/60 transition-colors hover:text-white">
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
                          <Link href={link.href} className="inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white">
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
            <p className="text-sm text-white/60">&copy; {new Date().getFullYear()} missiAI. All rights reserved.</p>
            <div className="flex items-center gap-4 text-sm text-white/60">
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
