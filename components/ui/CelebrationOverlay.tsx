'use client'

import { useEffect, useState } from 'react'

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  speedX: number
  speedY: number
  rotation: number
  rotationSpeed: number
  opacity: number
  shape: 'circle' | 'square' | 'star'
}

const COLORS = ['#FFFFFF', '#E5E5E5', '#D4D4D4', '#A3A3A3', '#F5F5F5', '#FAFAFA', '#E2E2E2', '#FFFFFF']

function createParticle(id: number): Particle {
  return {
    id,
    x: 50 + (Math.random() - 0.5) * 30,
    y: 50,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    size: 4 + Math.random() * 8,
    speedX: (Math.random() - 0.5) * 8,
    speedY: -3 - Math.random() * 6,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() - 0.5) * 15,
    opacity: 1,
    shape: (['circle', 'square', 'star'] as const)[Math.floor(Math.random() * 3)],
  }
}

export function CelebrationOverlay({
  planName,
  onComplete,
}: {
  planName: string
  onComplete: () => void
}) {
  const [particles, setParticles] = useState<Particle[]>([])
  const [showText, setShowText] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // Create particles in bursts
    const initial = Array.from({ length: 60 }, (_, i) => createParticle(i))
    setParticles(initial)

    // Show text after burst
    const textTimer = setTimeout(() => setShowText(true), 300)

    // Second burst
    const burst2 = setTimeout(() => {
      setParticles(prev => [
        ...prev,
        ...Array.from({ length: 30 }, (_, i) => createParticle(prev.length + i)),
      ])
    }, 500)

    // Start fade out
    const fadeTimer = setTimeout(() => setFadeOut(true), 3500)

    // Complete
    const completeTimer = setTimeout(() => onComplete(), 4200)

    return () => {
      clearTimeout(textTimer)
      clearTimeout(burst2)
      clearTimeout(fadeTimer)
      clearTimeout(completeTimer)
    }
  }, [onComplete])

  // Animate particles
  useEffect(() => {
    let animFrame: number
    const animate = () => {
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            x: p.x + p.speedX * 0.3,
            y: p.y + p.speedY * 0.3,
            speedY: p.speedY + 0.15, // gravity
            rotation: p.rotation + p.rotationSpeed,
            opacity: Math.max(0, p.opacity - 0.005),
          }))
          .filter(p => p.opacity > 0 && p.y < 120)
      )
      animFrame = requestAnimationFrame(animate)
    }
    animFrame = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animFrame)
  }, [])

  return (
    <div
      data-testid="celebration-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        pointerEvents: 'none',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 0.7s ease-out',
      }}
    >
      {/* Particles */}
      {particles.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.shape === 'star' ? 'transparent' : p.color,
            borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'star' ? '0' : '2px',
            border: p.shape === 'star' ? `2px solid ${p.color}` : 'none',
            opacity: p.opacity,
            transform: `rotate(${p.rotation}deg)`,
            boxShadow: `0 0 ${p.size}px ${p.color}40`,
          }}
        />
      ))}

      {/* Celebration Text */}
      {showText && (
        <div
          data-testid="celebration-text"
          style={{
            position: 'absolute',
            top: '42%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            animation: 'celebrationPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
          }}
        >
          <div
            style={{
              fontSize: 48,
              marginBottom: 8,
            }}
          >
            <Crown style={{ width: 48, height: 48, color: '#FFFFFF', display: 'inline' }} />
          </div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#fff',
              textShadow: '0 2px 20px rgba(0,0,0,0.5)',
              marginBottom: 8,
              letterSpacing: '-0.02em',
            }}
          >
            Welcome to {planName}!
          </h2>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(255,255,255,0.6)',
              textShadow: '0 1px 10px rgba(0,0,0,0.5)',
            }}
          >
            You just unlocked the full power of missiAI
          </p>
        </div>
      )}

      <style>{`
        @keyframes celebrationPop {
          0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
      `}</style>
    </div>
  )
}

// Need to import Crown in this file
import { Crown } from 'lucide-react'
