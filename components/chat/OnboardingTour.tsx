'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { STEPS } from '@/lib/constants/onboarding'

const STORAGE_KEY = 'missi-onboarding-v1'

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingTourProps {
  onComplete: () => void
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  // Calculate position based on target element
  useEffect(() => {
    const calculate = () => {
      if (!current.targetSelector || current.cardPlacement === 'center') {
        setCardPos(null)
        setSpotlightRect(null)
        return
      }

      const el = document.querySelector(current.targetSelector) as HTMLElement | null
      if (!el) {
        setCardPos(null)
        setSpotlightRect(null)
        return
      }

      const rect = el.getBoundingClientRect()
      setSpotlightRect(rect)

      const cardWidth = 280
      const cardHeight = 180
      const gap = 12

      let top = 0
      let left = 0

      switch (current.cardPlacement) {
        case 'below':
          top = rect.bottom + gap
          left = Math.min(
            rect.left + rect.width / 2 - cardWidth / 2,
            window.innerWidth - cardWidth - 16
          )
          left = Math.max(16, left)
          break
        case 'right':
          top = rect.top + rect.height / 2 - cardHeight / 2
          left = rect.right + gap
          // If it overflows right, put it left of the element
          if (left + cardWidth > window.innerWidth - 16) {
            left = rect.left - cardWidth - gap
          }
          left = Math.max(16, left)
          break
        case 'above':
          top = rect.top - cardHeight - gap
          left = rect.left + rect.width / 2 - cardWidth / 2
          left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16))
          break
      }

      // Clamp top
      top = Math.max(16, Math.min(top, window.innerHeight - cardHeight - 16))

      setCardPos({ top, left })
    }

    calculate()
    // Recalculate on resize
    window.addEventListener('resize', calculate)
    return () => window.removeEventListener('resize', calculate)
  }, [step, current])

  const handleNext = useCallback(() => {
    if (isLast) {
      try { localStorage.setItem(STORAGE_KEY, 'true') } catch {}
      onComplete()
    } else {
      setStep(s => s + 1)
    }
  }, [isLast, onComplete])

  const handleSkip = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true') } catch {}
    onComplete()
  }, [onComplete])

  const isCenter = current.cardPlacement === 'center'

  const renderCard = () => (
    <div
      className="rounded-2xl px-5 py-4"
      style={{
        background: 'rgba(255,255,255,0.07)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}
    >
      <h3
        className="text-sm font-medium tracking-wide mb-1.5"
        style={{ color: 'rgba(255,255,255,0.9)' }}
      >
        {current.title}
      </h3>
      <p
        className="text-xs font-light leading-relaxed"
        style={{ color: 'rgba(255,255,255,0.5)' }}
      >
        {current.text}
      </p>
      {current.hint && (
        <p
          className="text-[10px] font-light mt-1.5"
          style={{ color: 'rgba(255,255,255,0.25)' }}
        >
          {current.hint}
        </p>
      )}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 14 : 5,
                height: 5,
                borderRadius: 3,
                background: i === step ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.15)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          {!isLast && (
            <button
              onClick={handleSkip}
              className="text-[10px] font-light transition-opacity hover:opacity-80"
              style={{ color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            className="px-4 py-1.5 rounded-full text-xs font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ background: 'rgba(255,255,255,0.85)', color: '#000', border: 'none', cursor: 'pointer', letterSpacing: '0.01em' }}
          >
            {isLast ? "Let's go" : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-[9999]"
      style={{ pointerEvents: 'auto' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Dimmed overlay with spotlight cutout */}
      <svg
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: 'none' }}
      >
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left - 8}
                y={spotlightRect.top - 8}
                width={spotlightRect.width + 16}
                height={spotlightRect.height + 16}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.75)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Spotlight ring glow */}
      {spotlightRect && (
        <div
          className="absolute rounded-xl"
          style={{
            left: spotlightRect.left - 8,
            top: spotlightRect.top - 8,
            width: spotlightRect.width + 16,
            height: spotlightRect.height + 16,
            border: '1px solid rgba(255,255,255,0.25)',
            boxShadow: '0 0 20px rgba(255,255,255,0.08)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Card */}
      <AnimatePresence mode="wait">
        {isCenter ? (
          /* Center cards use flex wrapper — avoids Framer Motion transform conflict */
          <motion.div
            key={step}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{ zIndex: 2, pointerEvents: 'none' }}
          >
            <motion.div
              initial={{ y: 16, scale: 0.96 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -8, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{
                width: 280,
                maxWidth: 'calc(100vw - 32px)',
                pointerEvents: 'auto',
              }}
            >
              {renderCard()}
            </motion.div>
          </motion.div>
        ) : (
          /* Positioned cards use absolute top/left from element rect */
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="absolute"
            style={{
              ...(cardPos
                ? { top: cardPos.top, left: cardPos.left }
                : {}
              ),
              width: 280,
              maxWidth: 'calc(100vw - 32px)',
              zIndex: 2,
            }}
          >
            {renderCard()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * Check if onboarding should be shown.
 */
export function shouldShowOnboarding(): boolean {
  try {
    return !localStorage.getItem(STORAGE_KEY)
  } catch {
    return false
  }
}
