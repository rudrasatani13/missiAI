'use client'

import Link from 'next/link'
import { getAvatarTierInfo, type AvatarTier } from '@/types/gamification'

interface AvatarRingProps {
  tier: AvatarTier
  level: number
  size?: number
}

/**
 * Premium animated avatar ring for the navbar.
 * - Rotating conic gradient border
 * - Orbiting dot that circles the ring
 * - Glassmorphic center with tier-colored inner glow
 * - Pulse animation intensity scales with tier
 * No emojis, no icons.
 */
export function AvatarRing({ tier, level, size = 32 }: AvatarRingProps) {
  const tierInfo = getAvatarTierInfo(tier)
  const orbitSpeed = Math.max(2, 6 - tier * 0.6) // higher tier = faster orbit

  const ringId = `avatar-ring-${tier}`

  return (
    <Link
      href="/streak"
      onClick={(e) => e.stopPropagation()}
      title={`${tierInfo.name} — Level ${level}`}
      className="relative flex items-center justify-center shrink-0 group"
      style={{
        width: size,
        height: size,
        textDecoration: 'none',
      }}
    >
      {/* Outer rotating gradient ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(from 0deg, ${tierInfo.colorStart}, ${tierInfo.colorEnd}, transparent, ${tierInfo.colorStart})`,
          animation: `${ringId}-spin ${orbitSpeed * 2}s linear infinite`,
        }}
      />

      {/* Ring mask — creates the ring shape */}
      <div
        className="absolute rounded-full"
        style={{
          inset: 2,
          background: '#000',
        }}
      />

      {/* Inner glow */}
      <div
        className="absolute rounded-full"
        style={{
          inset: 2,
          background: `radial-gradient(circle at 40% 35%, ${tierInfo.colorStart}15, transparent 70%)`,
        }}
      />

      {/* Orbiting dot */}
      <div
        className="absolute inset-0"
        style={{
          animation: `${ringId}-spin ${orbitSpeed}s linear infinite`,
        }}
      >
        <div
          className="absolute rounded-full"
          style={{
            width: Math.max(3, size * 0.12),
            height: Math.max(3, size * 0.12),
            background: tierInfo.colorEnd,
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            boxShadow: `0 0 ${4 + tier * 2}px ${tierInfo.colorEnd}`,
          }}
        />
      </div>

      {/* Center content — tier initial with glow */}
      <span
        className="relative z-10 flex items-center justify-center transition-transform group-hover:scale-110"
        style={{
          fontSize: size * 0.32,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.75)',
          letterSpacing: '0.02em',
          fontFamily: 'var(--font-body)',
          textShadow: `0 0 ${6 + tier * 2}px ${tierInfo.colorStart}40`,
        }}
      >
        {tierInfo.name.charAt(0)}
      </span>

      {/* Ambient pulse */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          border: `1px solid ${tierInfo.colorStart}`,
          opacity: 0.08,
          animation: `${ringId}-pulse 3s ease-in-out infinite`,
        }}
      />

      <style jsx>{`
        @keyframes ${ringId}-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ${ringId}-pulse {
          0%, 100% { transform: scale(1); opacity: 0.05; }
          50% { transform: scale(1.15); opacity: 0.15; }
        }
      `}</style>
    </Link>
  )
}
