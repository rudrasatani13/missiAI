'use client'

import type { PlanId } from '@/types/billing'

interface UsageBarProps {
  usedSeconds: number
  limitSeconds: number
  planId: PlanId
  onUpgrade: () => void
}

function formatTime(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

function formatMinutes(totalSeconds: number): string {
  const mins = Math.ceil(totalSeconds / 60)
  return `${mins} min`
}

export function UsageBar({ usedSeconds, limitSeconds, planId, onUpgrade }: UsageBarProps) {
  if (planId === 'pro') return null

  const pct = Math.min((usedSeconds / limitSeconds) * 100, 100)
  const atLimit = usedSeconds >= limitSeconds

  let barColor = 'rgba(255,255,255,0.2)'
  if (pct >= 90) barColor = '#EF4444'
  else if (pct >= 70) barColor = '#F59E0B'

  return (
    <div
      data-testid="usage-bar"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        pointerEvents: 'auto',
      }}
    >
      {/* Progress bar */}
      <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.05)' }}>
        <div
          data-testid="usage-bar-progress"
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            transition: 'width 0.3s ease, background 0.3s ease',
          }}
        />
      </div>

      {/* Text area */}
      <div
        style={{
          height: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {atLimit ? (
          <span
            data-testid="usage-bar-limit-text"
            style={{ fontSize: 10, color: '#EF4444', fontWeight: 500, letterSpacing: '0.02em' }}
          >
            Daily limit reached —{' '}
            <button
              data-testid="usage-bar-upgrade-btn"
              onClick={onUpgrade}
              style={{
                background: 'none',
                border: 'none',
                color: '#F59E0B',
                cursor: 'pointer',
                fontSize: 10,
                fontWeight: 600,
                textDecoration: 'underline',
                padding: 0,
              }}
            >
              Upgrade Plan
            </button>
          </span>
        ) : (
          <span
            data-testid="usage-bar-count-text"
            style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.02em' }}
          >
            {formatTime(usedSeconds)} / {formatMinutes(limitSeconds)} voice today
          </span>
        )}
      </div>
    </div>
  )
}
