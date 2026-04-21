"use client"

import { useEffect, useRef } from "react"

export function BackgroundWaves({ color = "rgba(255, 80, 0, 0.8)" }: { color?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animationFrameId: number

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    
    window.addEventListener("resize", resize)
    resize()

    interface Particle {
      x: number
      baseX: number
      track: number
      speed: number
      size: number
      opacity: number
    }

    const particles: Particle[] = []
    const particleCount = typeof window !== "undefined" && window.innerWidth < 768 ? 150 : 350

    // Initialize particles scattered randomly across the width and assigned to different wave tracks
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        baseX: Math.random() * window.innerWidth,
        track: Math.floor(Math.random() * 3), // 3 wave tracks
        speed: 0.5 + Math.random() * 1.5,
        size: 1 + Math.random() * 2,
        opacity: 0.2 + Math.random() * 0.8,
      })
    }

    let time = 0

    const render = () => {
      time += 0.015

      // create a slight tail effect by clearing with opacity
      ctx.fillStyle = "rgba(7, 7, 8, 0.3)" // Matches the background color of the auth page
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const centerY = canvas.height / 2

      // Wave math configurations
      const waveConfigs = [
        { amplitude: 80, frequency: 0.002, speed: 2, offset: 0 },
        { amplitude: 120, frequency: 0.003, speed: 1.5, offset: Math.PI },
        { amplitude: 60, frequency: 0.004, speed: 3, offset: Math.PI / 2 },
      ]

      particles.forEach((p) => {
        // Move particle horizontally
        p.x -= p.speed
        if (p.x < 0) {
          p.x = canvas.width
          p.baseX = canvas.width
        }

        const config = waveConfigs[p.track]
        
        // Add a smooth fading effect at the very edges
        const edgeFade = Math.sin((p.x / canvas.width) * Math.PI)
        
        // Calculate the wavy Y position
        const y = centerY + 
                  Math.sin(p.x * config.frequency + time * config.speed + config.offset) * 
                  config.amplitude * 
                  edgeFade

        // Add some vertical drift/jitter to individual particles based on their base x and time
        const jitter = Math.sin(time * 2 + p.baseX) * 15 * edgeFade

        const finalY = y + jitter

        // Draw the glowing particle dot
        ctx.beginPath()
        ctx.arc(p.x, finalY, p.size, 0, Math.PI * 2)
        
        // Handle color opacity extraction securely
        ctx.fillStyle = color
        ctx.globalAlpha = p.opacity * edgeFade // fade out heavily at the far left/right edges
        ctx.fill()
      })
      
      ctx.globalAlpha = 1.0

      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      window.removeEventListener("resize", resize)
      cancelAnimationFrame(animationFrameId)
    }
  }, [color])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen"
    />
  )
}
