"use client"

// 'export const runtime = "edge";' ko completely hata dein

import { SignIn } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { useEffect, useRef } from "react"

export default function LoginPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    updateCanvasSize()

    let stars: {
      x: number; y: number; size: number
      brightness: number; twinkleSpeed: number; twinkleOffset: number
    }[] = []

    let shootingStars: {
      x: number; y: number; vx: number; vy: number
      length: number; brightness: number; life: number; maxLife: number
    }[] = []

    function createStars() {
      stars = []
      const starCount = window.innerWidth < 768 ? 150 : 300
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * canvas!.width,
          y: Math.random() * canvas!.height,
          size: Math.random() * 2 + 0.5,
          brightness: Math.random() * 0.8 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.01,
          twinkleOffset: Math.random() * Math.PI * 2,
        })
      }
    }

    function createShootingStar() {
      const side = Math.floor(Math.random() * 4)
      let startX: number, startY: number, endX: number, endY: number
      switch (side) {
        case 0:
          startX = Math.random() * canvas!.width; startY = -50
          endX = Math.random() * canvas!.width; endY = canvas!.height + 50; break
        case 1:
          startX = canvas!.width + 50; startY = Math.random() * canvas!.height
          endX = -50; endY = Math.random() * canvas!.height; break
        case 2:
          startX = Math.random() * canvas!.width; startY = canvas!.height + 50
          endX = Math.random() * canvas!.width; endY = -50; break
        default:
          startX = -50; startY = Math.random() * canvas!.height
          endX = canvas!.width + 50; endY = Math.random() * canvas!.height
      }
      const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2)
      const speed = 8 + Math.random() * 4
      return {
        x: startX, y: startY,
        vx: ((endX - startX) / distance) * speed,
        vy: ((endY - startY) / distance) * speed,
        length: 30 + Math.random() * 50,
        brightness: 0.8 + Math.random() * 0.2,
        life: 100 + Math.random() * 50,
        maxLife: 100 + Math.random() * 50,
      }
    }

    let animationFrameId: number
    let time = 0
    let lastShootingStarTime = 0

    function animate() {
      if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = "black"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      time += 0.016

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i]
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.5 + 0.5
        const alpha = star.brightness * twinkle
        const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 3)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
        gradient.addColorStop(0.3, `rgba(200, 220, 255, ${alpha * 0.6})`)
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)")
        ctx.fillStyle = gradient; ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill()
        if (star.brightness > 0.7 && twinkle > 0.8) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`; ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(star.x - star.size * 2, star.y); ctx.lineTo(star.x + star.size * 2, star.y)
          ctx.moveTo(star.x, star.y - star.size * 2); ctx.lineTo(star.x, star.y + star.size * 2)
          ctx.stroke()
        }
      }

      const interval = window.innerWidth < 768 ? 8 : 4
      if (time - lastShootingStarTime > interval + Math.random() * 6) {
        shootingStars.push(createShootingStar()); lastShootingStarTime = time
      }

      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const s = shootingStars[i]; s.x += s.vx; s.y += s.vy; s.life--
        const trailLen = Math.min(s.length, s.maxLife - s.life)
        const alpha = (s.life / s.maxLife) * s.brightness
        if (alpha > 0) {
          const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * trailLen, s.y - s.vy * trailLen)
          g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(0.3, `rgba(200,220,255,${alpha * 0.8})`)
          g.addColorStop(0.7, `rgba(100,150,255,${alpha * 0.4})`); g.addColorStop(1, "rgba(0,0,0,0)")
          ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.beginPath()
          ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * trailLen, s.y - s.vy * trailLen); ctx.stroke()
          const hg = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 4)
          hg.addColorStop(0, `rgba(255,255,255,${alpha})`); hg.addColorStop(0.5, `rgba(200,220,255,${alpha * 0.6})`)
          hg.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = hg; ctx.beginPath()
          ctx.arc(s.x, s.y, 3, 0, Math.PI * 2); ctx.fill()
        }
        if (s.life <= 0) shootingStars.splice(i, 1)
      }
      animationFrameId = requestAnimationFrame(animate)
    }

    const init = () => {
      if (canvas.width === 0 || canvas.height === 0) { setTimeout(init, 100); return }
      createStars(); animate()
    }
    init()

    const handleResize = () => {
      updateCanvasSize()
      setTimeout(() => { if (canvas.width > 0 && canvas.height > 0) { createStars(); shootingStars = [] } }, 100)
    }
    window.addEventListener("resize", handleResize)
    return () => { window.removeEventListener("resize", handleResize); if (animationFrameId) cancelAnimationFrame(animationFrameId) }
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden bg-black font-inter">
      {/* ✨ Animated Stars Background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label="Animated starry background" />

      {/* 🔙 Back to Home */}
      <div className="absolute top-4 left-4 md:top-8 md:left-8 z-20 login-animate-back">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs md:text-sm group glass-card px-3 py-2 md:px-4 md:py-2 rounded-full"
        >
          <ArrowLeft className="w-3 h-3 md:w-4 md:h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="hidden sm:inline">Back to Home</span>
          <span className="sm:hidden">Back</span>
        </Link>
      </div>

      {/* 🔑 Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 md:p-6 lg:p-8">

        {/* Glass Card — entry animation ONCE only, hover = subtle transition only */}
        <div className="w-full max-w-sm md:max-w-md glass-card-main rounded-2xl md:rounded-3xl p-1 shadow-2xl login-animate-card">
          <SignIn
            signUpUrl="/waitlist"
            appearance={{
              baseTheme: dark,
              elements: {
                card: "bg-transparent shadow-none border-none",
                rootBox: "w-full",
                headerTitle: "text-white font-semibold text-xl md:text-2xl",
                headerSubtitle: "text-white/50 font-light text-sm",
                socialButtonsBlockButton:
                  "bg-white/5 border border-white/10 hover:bg-white/10 text-white transition-colors rounded-xl",
                socialButtonsBlockButtonText: "text-white font-medium text-sm",
                formButtonPrimary:
                  "bg-white text-black hover:bg-white/90 transition-all rounded-full font-medium py-2.5",
                formFieldInput:
                  "bg-white/5 border border-white/10 text-white focus:border-white/30 rounded-xl placeholder:text-white/30",
                formFieldLabel: "text-white/70 font-light text-sm",
                dividerLine: "bg-white/10",
                dividerText: "text-white/40",
                footer: "hidden",
                cardBox: "bg-transparent shadow-none",
                main: "gap-4",
              },
              layout: {
                socialButtonsPlacement: "top",
                showOptionalFields: false,
              },
            }}
          />
        </div>

        {/* 📝 Waitlist Link */}
        <div className="mt-4 text-center text-sm login-animate-waitlist">
          <span className="text-white/50 font-light">Want early access? </span>
          <Link
            href="/waitlist"
            className="text-white font-medium hover:text-white/80 transition-colors underline underline-offset-4"
          >
            Join waitlist
          </Link>
        </div>

        {/* 🦶 Footer — CENTERED */}
        <div className="mt-6 md:mt-8 flex items-center justify-center w-full max-w-sm md:max-w-md text-xs text-gray-400 login-animate-footer">
          <div className="flex items-center gap-2 md:gap-4 text-center">
            <span className="text-xs">Follow missiAI on</span>
            <Link href="#" className="hover:text-white transition-colors">
              𝕏
            </Link>
            <span className="text-xs">and</span>
            <Link href="#" className="hover:text-white transition-colors underline">
              Discord
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}