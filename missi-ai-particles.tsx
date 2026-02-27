"use client"

import { useRef, useEffect, useState } from "react"

export default function Component() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mousePositionRef = useRef({ x: 0, y: 0 })
  const isTouchingRef = useRef(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const updateCanvasSize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      setIsMobile(window.innerWidth < 768)
    }

    updateCanvasSize()

    let particles: {
      x: number
      y: number
      baseX: number
      baseY: number
      size: number
      color: string
      scatteredColor: string
      life: number
      isMissi: boolean
    }[] = []

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

    let textImageData: ImageData | null = null

    function createStars() {
      stars = []
      const starCount = isMobile ? 100 : 200

      for (let i = 0; i < starCount; i++) {
        const baseX = Math.random() * canvas!.width
        const baseY = Math.random() * canvas!.height
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

      // Start from random edge and shoot across screen
      switch (side) {
        case 0: // Top
          startX = Math.random() * canvas!.width
          startY = -50
          endX = Math.random() * canvas!.width
          endY = canvas!.height + 50
          break
        case 1: // Right
          startX = canvas!.width + 50
          startY = Math.random() * canvas!.height
          endX = -50
          endY = Math.random() * canvas!.height
          break
        case 2: // Bottom
          startX = Math.random() * canvas!.width
          startY = canvas!.height + 50
          endX = Math.random() * canvas!.width
          endY = -50
          break
        default: // Left
          startX = -50
          startY = Math.random() * canvas!.height
          endX = canvas!.width + 50
          endY = Math.random() * canvas!.height
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

    function createTextImage() {
      if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) return 0

      ctx.fillStyle = "white"
      ctx.save()

      // Set font size based on screen size
      const fontSize = isMobile ? 48 : 96
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      const centerX = canvas.width / 2
      const centerY = canvas.height / 2

      // Measure text to position properly
      const missiText = "missi"
      const aiText = "AI"
      const missiMetrics = ctx.measureText(missiText)
      const aiMetrics = ctx.measureText(aiText)
      const spacing = fontSize * 0.3 // Space between words

      const totalWidth = missiMetrics.width + spacing + aiMetrics.width
      const startX = centerX - totalWidth / 2

      // Position text at center
      const textY = centerY

      // Draw "missi" text
      ctx.fillText(missiText, startX + missiMetrics.width / 2, textY)

      // Draw "AI" text
      ctx.fillText(aiText, startX + missiMetrics.width + spacing + aiMetrics.width / 2, textY)

      ctx.restore()

      // Ensure canvas has valid dimensions before getting image data
      if (canvas.width > 0 && canvas.height > 0) {
        textImageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        ctx.clearRect(0, 0, canvas.width, canvas.height)
      }

      return fontSize / 96 // Return scale factor
    }

    function createParticle(scale: number) {
      if (!ctx || !canvas || !textImageData || canvas.width === 0 || canvas.height === 0) return null

      const data = textImageData.data

      for (let attempt = 0; attempt < 100; attempt++) {
        const x = Math.floor(Math.random() * canvas.width)
        const y = Math.floor(Math.random() * canvas.height)

        if (data[(y * canvas.width + x) * 4 + 3] > 128) {
          // Determine if particle is part of "missi" or "AI"
          const centerX = canvas.width / 2
          const fontSize = isMobile ? 48 : 96
          const missiText = "missi"
          const aiText = "AI"
          ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`
          const missiMetrics = ctx.measureText(missiText)
          const aiMetrics = ctx.measureText(aiText)
          const spacing = fontSize * 0.3
          const totalWidth = missiMetrics.width + spacing + aiMetrics.width
          const startX = centerX - totalWidth / 2
          const missiEndX = startX + missiMetrics.width

          const isMissi = x <= missiEndX + spacing / 2

          return {
            x: x,
            y: y,
            baseX: x,
            baseY: y,
            size: Math.random() * 1.5 + 0.5,
            color: "white",
            scatteredColor: isMissi ? "#00DCFF" : "#FF6B6B", // Cyan for "missi", coral for "AI"
            isMissi: isMissi,
            life: Math.random() * 100 + 50,
          }
        }
      }

      return null
    }

    function createInitialParticles(scale: number) {
      if (!textImageData) return

      const baseParticleCount = 8000 // Increased for better text definition
      const particleCount = Math.floor(baseParticleCount * Math.sqrt((canvas!.width * canvas!.height) / (1920 * 1080)))
      for (let i = 0; i < particleCount; i++) {
        const particle = createParticle(scale)
        if (particle) particles.push(particle)
      }
    }

    let animationFrameId: number
    let time = 0
    let lastShootingStarTime = 0

    function animate(scale: number) {
      if (!ctx || !canvas || canvas.width === 0 || canvas.height === 0) return

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      time += 0.016 // ~60fps

      const { x: mouseX, y: mouseY } = mousePositionRef.current

      // Draw twinkling stars with cursor movement
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i]

        // Calculate distance from mouse to star
        const dx = mouseX - star.baseX
        const dy = mouseY - star.baseY
        const distance = Math.sqrt(dx * dx + dy * dy)
        const maxStarDistance = 300 // Stars respond within this distance

        // Apply subtle movement based on cursor position
        if (distance < maxStarDistance) {
          const force = (maxStarDistance - distance) / maxStarDistance
          const moveX = (dx / distance) * force * 15 // Very subtle movement (15px max)
          const moveY = (dy / distance) * force * 15
          star.x = star.baseX + moveX
          star.y = star.baseY + moveY
        } else {
          // Smoothly return to original position
          star.x += (star.baseX - star.x) * 0.05
          star.y += (star.baseY - star.y) * 0.05
        }

        const twinkle = Math.sin(time * star.twinkleSpeed + star.twinkleOffset) * 0.5 + 0.5
        const alpha = star.brightness * twinkle

        // Create star glow effect
        const gradient = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, star.size * 3)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
        gradient.addColorStop(0.3, `rgba(200, 220, 255, ${alpha * 0.6})`)
        gradient.addColorStop(1, "transparent")

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

      // Create shooting stars occasionally
      if (time - lastShootingStarTime > 3 + Math.random() * 4) {
        // Every 3-7 seconds
        shootingStars.push(createShootingStar())
        lastShootingStarTime = time
      }

      // Draw and update shooting stars
      for (let i = shootingStars.length - 1; i >= 0; i--) {
        const shootingStar = shootingStars[i]

        // Update position
        shootingStar.x += shootingStar.vx
        shootingStar.y += shootingStar.vy
        shootingStar.life--

        // Calculate trail positions
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
          gradient.addColorStop(1, "transparent")

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

        // Remove dead shooting stars
        if (shootingStar.life <= 0) {
          shootingStars.splice(i, 1)
        }
      }

      // Draw main text particles (on top of stars)
      const maxDistance = 240

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const dx = mouseX - p.x
        const dy = mouseY - p.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < maxDistance && (isTouchingRef.current || !("ontouchstart" in window))) {
          const force = (maxDistance - distance) / maxDistance
          const angle = Math.atan2(dy, dx)
          const moveX = Math.cos(angle) * force * 60
          const moveY = Math.sin(angle) * force * 60
          p.x = p.baseX - moveX
          p.y = p.baseY - moveY

          ctx.fillStyle = p.scatteredColor
        } else {
          p.x += (p.baseX - p.x) * 0.1
          p.y += (p.baseY - p.y) * 0.1
          ctx.fillStyle = "white"
        }

        ctx.fillRect(p.x, p.y, p.size, p.size)

        p.life--
        if (p.life <= 0) {
          const newParticle = createParticle(scale)
          if (newParticle) {
            particles[i] = newParticle
          } else {
            particles.splice(i, 1)
            i--
          }
        }
      }

      const baseParticleCount = 8000
      const targetParticleCount = Math.floor(
        baseParticleCount * Math.sqrt((canvas.width * canvas.height) / (1920 * 1080)),
      )
      while (particles.length < targetParticleCount) {
        const newParticle = createParticle(scale)
        if (newParticle) particles.push(newParticle)
      }

      animationFrameId = requestAnimationFrame(() => animate(scale))
    }

    // Add a small delay to ensure canvas is properly sized
    const initializeEffect = () => {
      if (canvas.width === 0 || canvas.height === 0) {
        setTimeout(initializeEffect, 100)
        return
      }

      const scale = createTextImage()
      createStars()
      if (textImageData) {
        createInitialParticles(scale)
        animate(scale)
      }
    }

    initializeEffect()

    const handleResize = () => {
      updateCanvasSize()
      // Add delay after resize to ensure canvas is properly sized
      setTimeout(() => {
        if (canvas.width > 0 && canvas.height > 0) {
          const newScale = createTextImage()
          createStars()
          particles = []
          shootingStars = []
          if (textImageData) {
            createInitialParticles(newScale)
          }
        }
      }, 100)
    }

    const handleMove = (x: number, y: number) => {
      mousePositionRef.current = { x, y }
    }

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault()
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }

    const handleTouchStart = () => {
      isTouchingRef.current = true
    }

    const handleTouchEnd = () => {
      isTouchingRef.current = false
      mousePositionRef.current = { x: 0, y: 0 }
    }

    const handleMouseLeave = () => {
      if (!("ontouchstart" in window)) {
        mousePositionRef.current = { x: 0, y: 0 }
      }
    }

    window.addEventListener("resize", handleResize)
    canvas.addEventListener("mousemove", handleMouseMove)
    canvas.addEventListener("touchmove", handleTouchMove, { passive: false })
    canvas.addEventListener("mouseleave", handleMouseLeave)
    canvas.addEventListener("touchstart", handleTouchStart)
    canvas.addEventListener("touchend", handleTouchEnd)

    return () => {
      window.removeEventListener("resize", handleResize)
      canvas.removeEventListener("mousemove", handleMouseMove)
      canvas.removeEventListener("touchmove", handleTouchMove)
      canvas.removeEventListener("mouseleave", handleMouseLeave)
      canvas.removeEventListener("touchstart", handleTouchStart)
      canvas.removeEventListener("touchend", handleTouchEnd)
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId)
      }
    }
  }, [isMobile])

  return (
    <div className="relative w-full h-dvh flex flex-col items-center justify-center bg-transparent">
      <canvas
        ref={canvasRef}
        className="w-full h-full absolute top-0 left-0 touch-none"
        aria-label="Interactive particle effect with missiAI logo and starry background"
      />

      {/* Coming Soon text - positioned below the particle text */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 mt-16 sm:mt-20 md:mt-24 z-10">
        <p className="text-gray-400 text-lg sm:text-xl md:text-2xl font-light tracking-wider">Coming Soon</p>
      </div>

      <div className="absolute bottom-[100px] text-center z-10">
        <p className="font-mono text-gray-400 text-xs sm:text-base md:text-sm">
          Powered by <span className="text-gray-300 hover:text-cyan-400 transition-colors duration-300">missiAI</span> -
          Next Generation AI Platform
        </p>
      </div>
    </div>
  )
}
