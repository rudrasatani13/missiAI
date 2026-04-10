"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useEffect, useRef } from "react"

function StarCanvas() {
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
      const count = window.innerWidth < 768 ? 120 : 250
      for (let i = 0; i < count; i++) {
        stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 1.5 + 0.3,
          brightness: Math.random() * 0.6 + 0.2,
          speed: Math.random() * 0.015 + 0.005,
          offset: Math.random() * Math.PI * 2,
        })
      }
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const s of stars) {
        const b = s.brightness * (0.5 + 0.5 * Math.sin(t * s.speed + s.offset))
        ctx.fillStyle = `rgba(255,255,255,${b})`
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }
      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
}

export default function ManifestoPage() {
  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      <StarCanvas />

      {/* Back Button */}
      <div className="absolute top-4 left-4 md:top-8 md:left-8 z-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs md:text-sm group px-3 py-2 md:px-4 md:py-2 rounded-full"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <ArrowLeft className="w-3 h-3 md:w-4 md:h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="hidden sm:inline">Back to Home</span>
          <span className="sm:hidden">Back</span>
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 md:p-6 lg:p-8">
        <div className="w-full max-w-sm md:max-w-lg rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-2xl"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}>

          {/* LED Brand Logo */}
          <div className="flex items-center justify-center mb-4 select-none">
            <svg width="120" height="28" viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg" className="w-auto h-6 md:h-7 opacity-80">
              <defs>
                <pattern id="led-manifesto" width="2" height="2" patternUnits="userSpaceOnUse">
                  <rect x="0.25" y="0.25" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,1)" />
                </pattern>
                <mask id="text-mask-manifesto">
                  <rect width="100%" height="100%" fill="black" />
                  <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
                    fontSize="24" fontWeight="400" fontFamily="'VT323','Space Mono',monospace" fill="white" letterSpacing="4">
                    MISSI
                  </text>
                </mask>
              </defs>
              <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
                fontSize="24" fontWeight="400" fontFamily="'VT323','Space Mono',monospace" fill="#ffffff" opacity="0.2" style={{ filter: "blur(3px)" }} letterSpacing="4">
                MISSI
              </text>
              <rect width="100%" height="100%" fill="url(#led-manifesto)" mask="url(#text-mask-manifesto)" />
            </svg>
          </div>

          {/* Manifesto Content */}
          <div className="flex flex-col gap-6 md:gap-8 text-left">
            <div className="text-gray-200 text-xs md:text-sm leading-relaxed space-y-3 md:space-y-4 font-light">
              <p>
                At missiAI, we believe that artificial intelligence should transcend current limitations and redefine what&apos;s
                possible. Our mission is to create the most advanced human AI assistant ever built—one that doesn&apos;t just
                respond, but truly understands, anticipates, and evolves with human needs.
              </p>

              <p>
                We envision a future where AI doesn&apos;t just process information, but demonstrates genuine intelligence,
                creativity, and problem-solving capabilities that rival and complement human cognition. Our platform
                represents a quantum leap in AI technology, delivering unprecedented performance, sophistication, and
                human-like interaction.
              </p>

              <p>
                Built for visionaries, innovators, and those who demand excellence, missiAI is designed to push the
                boundaries of what AI can achieve. We&apos;re not just building another assistant—we&apos;re crafting the future of
                human-AI collaboration, where intelligence knows no bounds.
              </p>
            </div>

            {/* Signature */}
            <div className="flex flex-col gap-1 mt-6 md:mt-8">
              <div className="text-white text-2xl md:text-3xl italic transform -rotate-2" style={{ fontFamily: "var(--font-dancing-script), cursive" }}>Rudra S.</div>
              <div className="text-gray-400 text-xs">Rudra Satani, CEO&nbsp;@&nbsp;missiAI</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
