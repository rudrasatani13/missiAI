"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import type { ReactNode, CSSProperties } from "react"
import { motion, AnimatePresence } from "framer-motion"

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true)
          observer.unobserve(element)
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

const products = [
  {
    id: 0,
    image: "/images/landing/product/hero-chat-interface.png",
    tag: "Voice",
    title: "Talk naturally, get real answers",
    description:
      "Voice-first AI that listens, understands context, and responds like someone who actually knows you. No typing required — just speak.",
    stats: [
      { label: "response time", value: "<200ms" },
      { label: "languages", value: "40+" },
    ],
  },
  {
    id: 1,
    image: "/images/landing/product/memory-graph.png",
    tag: "Memory",
    title: "Everything you share, remembered",
    description:
      "32 memory categories across relationships, goals, habits, emotions — all connected, reviewable, and permission-led. Your context, preserved.",
    stats: [
      { label: "memory categories", value: "32" },
      { label: "conversations tracked", value: "157" },
    ],
  },
  {
    id: 2,
    image: "/images/landing/product/budget-dashboard.png",
    tag: "Tools",
    title: "Daily tools that actually help",
    description:
      "Budget Buddy tracks spending patterns you never noticed. Exam Buddy turns weak topics into study plans. Both connected to your memory.",
    stats: [
      { label: "tools", value: "5" },
      { label: "budget tracked", value: "$3,426" },
    ],
  },
]

function getStackStyle(index: number, activeIndex: number, total: number) {
  const diff = (index - activeIndex + total) % total
  if (diff === 0) {
    // Active — front, sharp, full size
    return {
      scale: 1,
      zIndex: 30,
      opacity: 1,
      blur: 0,
      x: 0,
      y: 0,
      rotate: 0,
    }
  }
  if (diff === 1) {
    // Behind active — blurred, smaller, offset down-right
    return {
      scale: 0.92,
      zIndex: 20,
      opacity: 0.4,
      blur: 6,
      x: 20,
      y: 16,
      rotate: 2,
    }
  }
  // Furthest back — very blurred, smaller, more offset
  return {
    scale: 0.84,
    zIndex: 10,
    opacity: 0.18,
    blur: 12,
    x: 40,
    y: 32,
    rotate: 4,
  }
}

export function ProductShowcase() {
  const [active, setActive] = useState(0)
  const [hovered, setHovered] = useState(false)

  const next = useCallback(() => {
    setActive((prev) => (prev + 1) % products.length)
  }, [])

  useEffect(() => {
    if (hovered) return
    const interval = setInterval(next, 4500)
    return () => clearInterval(interval)
  }, [hovered, next])

  const current = products[active]

  return (
    <section className="relative overflow-hidden py-20 sm:py-24 lg:py-40">
      <div className="relative z-10 mx-auto max-w-[92rem] px-5 sm:px-6 lg:px-8">
        <Reveal className="flex justify-center">
          <span
            className="mb-8 inline-flex items-center gap-4 text-sm text-white/45"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            <span className="h-px w-12 bg-white/20" />
            Product
            <span className="h-px w-12 bg-white/20" />
          </span>
        </Reveal>
        <Reveal delay={0.08}>
          <h2
            className="mb-16 text-center text-[2.9rem] leading-[0.9] sm:mb-20 sm:text-6xl md:text-7xl lg:mb-24 lg:text-[128px]"
            style={{ fontFamily: "'Instrument Serif', serif" }}
          >
            See it
            <br />
            <span className="text-white/35">in action.</span>
          </h2>
        </Reveal>

        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
          {/* Left — layered screenshot stack */}
          <div
            className="relative flex justify-center lg:justify-start"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
          >
            <div className="relative w-full max-w-[640px]">
              {/* Aspect ratio container */}
              <div
                className="relative pb-[62%] cursor-pointer"
                onClick={() => setActive((prev) => (prev + 1) % products.length)}
              >
                {products.map((product, index) => {
                  const style = getStackStyle(index, active, products.length)
                  const isActive = index === active
                  return (
                    <motion.div
                      key={product.id}
                      className="absolute inset-0 rounded-lg bg-black shadow-2xl"
                      animate={{
                        scale: style.scale,
                        zIndex: style.zIndex,
                        opacity: style.opacity,
                        x: style.x,
                        y: style.y,
                        rotate: style.rotate,
                      }}
                      whileHover={isActive ? { scale: 1.02 } : {}}
                      transition={{
                        type: "spring",
                        stiffness: 200,
                        damping: 26,
                        mass: 1,
                      }}
                      style={{
                        filter: isActive ? "blur(0px)" : `blur(${style.blur}px)`,
                      }}
                    >
                      <img
                        src={product.image}
                        alt={product.title}
                        className="h-full w-full rounded-lg object-cover"
                      />
                    </motion.div>
                  )
                })}
              </div>

              {/* Dot indicators */}
              <div className="mt-8 flex justify-center gap-2">
                {products.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setActive(index)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      index === active ? "w-6 bg-white" : "w-2 bg-white/25 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right — synced text */}
          <div className="relative">
            <AnimatePresence mode="wait">
              <motion.div
                key={active}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <span
                  className="mb-4 inline-block text-xs uppercase tracking-[0.22em] text-white/40"
                  style={{ fontFamily: "'JetBrains Mono', monospace" }}
                >
                  {current.tag}
                </span>
                <h3
                  className="mb-5 text-3xl leading-tight sm:text-4xl lg:text-5xl"
                  style={{ fontFamily: "'Instrument Serif', serif" }}
                >
                  {current.title}
                </h3>
                <p className="max-w-lg text-base leading-relaxed text-white/55 sm:text-lg">
                  {current.description}
                </p>

                <div className="mt-8 flex gap-8">
                  {current.stats.map((stat) => (
                    <div key={stat.label}>
                      <div
                        className="text-2xl text-white sm:text-3xl"
                        style={{ fontFamily: "'Instrument Serif', serif" }}
                      >
                        {stat.value}
                      </div>
                      <div
                        className="mt-1 text-xs text-white/40"
                        style={{ fontFamily: "'JetBrains Mono', monospace" }}
                      >
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            {/* Click hint */}
            <div className="mt-12 flex items-center gap-2 text-xs text-white/30" style={{ fontFamily: "'JetBrains Mono', monospace" }}>
              <span className="inline-block h-1 w-1 rounded-full bg-white/30" />
              Click image to explore
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
