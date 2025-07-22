"use client"
import type React from "react"
import Link from "next/link"
import { ThemeToggle } from "./theme-toggle"
import { useEffect, useRef } from "react"
import { ArrowLeft } from "lucide-react"

interface WaitlistLayoutProps {
  children: React.ReactNode
  activeTab: "waitlist" | "manifesto"
}

export function WaitlistLayout({ children, activeTab }: WaitlistLayoutProps) {
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
      x: number
      y: number
      baseX: number
      baseY: number
      size: number
      brightness: number
      twinkleSpeed: number
      twinkleOffset: number
    }[] = []

    let shootingStars: {
      x: number
      y: number
      vx: number
      vy: number
      length: number
      brightness: number
      life: number
      maxLife: number
    }[] = []

    function createStars() {
      stars = []
      const starCount = window.innerWidth < 768 ? 150 : 300 // Fewer stars on mobile

      for (let i = 0; i < starCount; i++) {
        const baseX = Math.random() * canvas.width
        const baseY = Math.random() * canvas.height
        stars.push({
          x: baseX,
          y: baseY,
          baseX: baseX,
          baseY: baseY,
          size: Math.random() * 2 + 0.5,
          brightness: Math.random() * 0.8 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.01,
          twinkleOffset: Math.random() * Math.PI * 2,
        })
      }
    }

    function createShootingStar() {
      const side = Math.floor(Math.random() * 4)
      let startX, startY, endX, endY

      switch (side) {
        case 0: // Top
          startX = Math.random() * canvas.width
          startY = -50
          endX = Math.random() * canvas.width
          endY = canvas.height + 50
          break
        case 1: // Right
          startX = canvas.width + 50
          startY = Math.random() * canvas.height
          endX = -50
          endY = Math.random() * canvas.height
          break
        case 2: // Bottom
          startX = Math.random() * canvas.width
          startY = canvas.height + 50
          endX = Math.random() * canvas.width
          endY = -50
          break
        default: // Left
          startX = -50
          startY = Math.random() * canvas.height
          endX = canvas.width + 50
          endY = Math.random() * canvas.height
      }

      const distance = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2)
      const speed = 8 + Math.random() * 4

      return {
        x: startX,
        y: startY,
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

      // Draw twinkling stars
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i]
        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.5 + 0.5
        const alpha = star.brightness * twinkle

        // Create star glow effect
        const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 3)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
        gradient.addColorStop(0.3, `rgba(200, 220, 255, ${alpha * 0.6})`)
        gradient.addColorStop(1, "rgba(0, 0, 0, 0)")

        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2)
        ctx.fill()

        // Add cross sparkle effect for brighter stars
        if (star.brightness > 0.7 && twinkle > 0.8) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.8})`
          ctx.lineWidth = 0.5
          ctx.beginPath()
          ctx.moveTo(star.x - star.size * 2, star.y)
          ctx.lineTo(star.x + star.size * 2, star.y)
          ctx.moveTo(star.x, star.y - star.size * 2)
          ctx.lineTo(star.x, star.y + star.size * 2)
          ctx.stroke()
        }
      }

      // Create shooting stars occasionally (less frequent on mobile)
      const shootingStarInterval = window.innerWidth < 768 ? 8 : 4
      if (time - lastShootingStarTime > shootingStarInterval + Math.random() * 6) {
        shootingStars.push(createShootingStar())
        lastShootingStarTime = time
      }

      // Draw and update shooting stars
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const shootingStar = shootingStars[i]

        shootingStar.x += shootingStar.vx
        shootingStar.y += shootingStar.vy
        shootingStar.life--

        const trailLength = Math.min(shootingStar.length, shootingStar.maxLife - shootingStar.life)
        const alpha = (shootingStar.life / shootingStar.maxLife) * shootingStar.brightness

        if (alpha > 0) {
          // Draw shooting star trail
          const gradient = ctx.createLinearGradient(
            shootingStar.x,
            shootingStar.y,
            shootingStar.x - shootingStar.vx * trailLength,
            shootingStar.y - shootingStar.vy * trailLength,
          )
          gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
          gradient.addColorStop(0.3, `rgba(200, 220, 255, ${alpha * 0.8})`)
          gradient.addColorStop(0.7, `rgba(100, 150, 255, ${alpha * 0.4})`)
          gradient.addColorStop(1, "rgba(0, 0, 0, 0)")

          ctx.strokeStyle = gradient
          ctx.lineWidth = 2
          ctx.lineCap = "round"
          ctx.beginPath()
          ctx.moveTo(shootingStar.x, shootingStar.y)
          ctx.lineTo(shootingStar.x - shootingStar.vx * trailLength, shootingStar.y - shootingStar.vy * trailLength)
          ctx.stroke()

          // Draw bright head
          const headGradient = ctx.createRadialGradient(
            shootingStar.x,
            shootingStar.y,
            0,
            shootingStar.x,
            shootingStar.y,
            4,
          )
          headGradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
          headGradient.addColorStop(0.5, `rgba(200, 220, 255, ${alpha * 0.6})`)
          headGradient.addColorStop(1, "rgba(0, 0, 0, 0)")

          ctx.fillStyle = headGradient
          ctx.beginPath()
          ctx.arc(shootingStar.x, shootingStar.y, 3, 0, Math.PI * 2)
          ctx.fill()
        }

        if (shootingStar.life <= 0) {
          shootingStars.splice(i, 1)
        }
      }

      animationFrameId = requestAnimationFrame(animate)
    }

    const initializeEffect = () => {
      if (canvas.width === 0 || canvas.height === 0) {
        setTimeout(initializeEffect, 100)
        return
      }
      createStars()
      animate()
    }

    initializeEffect()

    const handleResize = () => {
      updateCanvasSize()
      setTimeout(() => {
        if (canvas.width > 0 && canvas.height > 0) {
          createStars()
          shootingStars = []
        }
      }, 100)
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [])

  return (
    <div className="min-h-screen relative overflow-hidden bg-black font-inter">
      {/* Animated Stars Background */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-label="Animated starry background" />

      {/* Back Button - Responsive positioning */}
      <div className="absolute top-4 left-4 md:top-8 md:left-8 z-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-xs md:text-sm group glass-card px-3 py-2 md:px-4 md:py-2 rounded-full"
        >
          <ArrowLeft className="w-3 h-3 md:w-4 md:h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="hidden sm:inline">Back to Home</span>
          <span className="sm:hidden">Back</span>
        </Link>
      </div>

      {/* Content - Responsive layout */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen p-4 md:p-6 lg:p-8">
        {/* Navigation Tabs - Responsive sizing */}
        <div className="mb-6 md:mb-8">
          <div className="flex glass-card rounded-full p-1">
            <Link
              href="/waitlist"
              className={`px-4 py-2 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all ${
                activeTab === "waitlist" ? "glass-tab-active" : "glass-tab text-gray-300 hover:text-white"
              }`}
            >
              Waitlist
            </Link>
            <Link
              href="/manifesto"
              className={`px-4 py-2 md:px-6 md:py-2.5 rounded-full text-xs md:text-sm font-medium transition-all ${
                activeTab === "manifesto" ? "glass-tab-active" : "glass-tab text-gray-300 hover:text-white"
              }`}
            >
              Manifesto
            </Link>
          </div>
        </div>

        {/* Main Card - Responsive sizing and padding */}
        <div className="w-full max-w-sm md:max-w-lg glass-card-main rounded-2xl md:rounded-3xl p-6 md:p-8 shadow-2xl">
          {children}
        </div>

        {/* Footer - Responsive layout */}
        <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-between w-full max-w-sm md:max-w-lg text-xs text-gray-400 gap-4 sm:gap-0">
          <div className="flex items-center gap-2 md:gap-4 text-center sm:text-left">
            <span className="text-xs">Follow missiAI on</span>
            <Link href="#" className="hover:text-white transition-colors">
              𝕏
            </Link>
            <span className="text-xs">and</span>
            <Link href="#" className="hover:text-white transition-colors underline">
              Discord
            </Link>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </div>
  )
}
