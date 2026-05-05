'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { STEPS } from '@/lib/constants/onboarding'

const NAV_PILL_BOTTOM = 80 // px — keep card below the top nav pill

const STORAGE_KEY = 'missi-onboarding-v1'

// ─── Component ────────────────────────────────────────────────────────────────

interface OnboardingTourProps {
  onComplete: () => void
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  const [step, setStep] = useState(0)
  const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null)
  const [spotlightRect, setSpotlightRect] = useState<DOMRect | null>(null)
  const [cardSize, setCardSize] = useState({ width: 280, height: 180 })
  const cardRef = useRef<HTMLDivElement | null>(null)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1

  useEffect(() => {
    const card = cardRef.current
    if (!card) return

    const measure = () => {
      const rect = card.getBoundingClientRect()
      if (!rect.width || !rect.height) return

      setCardSize((prev) => {
        if (prev.width === rect.width && prev.height === rect.height) {
          return prev
        }

        return { width: rect.width, height: rect.height }
      })
    }

    measure()

    if (typeof ResizeObserver === 'undefined') {
      return
    }

    const observer = new ResizeObserver(() => measure())
    observer.observe(card)

    return () => observer.disconnect()
  }, [step])

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
      if (!rect.width || !rect.height) {
        setCardPos(null)
        setSpotlightRect(null)
        return
      }

      setSpotlightRect(rect)

      const cardWidth = cardSize.width
      const cardHeight = cardSize.height
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

      // Clamp top — keep below the nav pill and above the bottom edge
      top = Math.max(NAV_PILL_BOTTOM, Math.min(top, window.innerHeight - cardHeight - 16))

      setCardPos({ top, left })
    }

    calculate()
    const frameId = requestAnimationFrame(calculate)
    const timeoutId = window.setTimeout(calculate, 180)
    window.addEventListener('resize', calculate)
    window.addEventListener('scroll', calculate, true)

    const target = current.targetSelector ? document.querySelector(current.targetSelector) : null
    const resizeObserver = typeof ResizeObserver !== 'undefined' && target instanceof HTMLElement
      ? new ResizeObserver(() => calculate())
      : null

    if (resizeObserver && target instanceof HTMLElement) {
      resizeObserver.observe(target)
    }

    return () => {
      cancelAnimationFrame(frameId)
      window.clearTimeout(timeoutId)
      window.removeEventListener('resize', calculate)
      window.removeEventListener('scroll', calculate, true)
      resizeObserver?.disconnect()
    }
  }, [step, current, cardSize.height, cardSize.width])

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
  const shouldCenterCard = isCenter || (!cardPos && Boolean(current.targetSelector))

  const [isLight, setIsLight] = useState(false)
  useEffect(() => {
    const check = () => setIsLight(document.documentElement.getAttribute('data-theme') === 'light')
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  const renderCard = () => (
    <div
      ref={cardRef}
      className="rounded-2xl px-5 py-4"
      style={{
        background: isLight ? 'var(--missi-border)' : 'rgba(20,20,28,0.92)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: isLight ? '1px solid rgba(0,0,0,0.08)' : '1px solid var(--missi-border-strong)',
        boxShadow: isLight ? '0 16px 48px rgba(0,0,0,0.14)' : '0 16px 48px rgba(0,0,0,0.5)',
      }}
    >
      <h3
        className="text-sm font-medium tracking-wide mb-1.5"
        style={{ color: isLight ? '#111827' : 'var(--missi-text-primary)' }}
      >
        {current.title}
      </h3>
      <p
        className="text-xs font-light leading-relaxed"
        style={{ color: isLight ? 'rgba(17,24,39,0.6)' : 'var(--missi-text-secondary)' }}
      >
        {current.text}
      </p>
      {current.hint && (
        <p
          className="text-[10px] font-light mt-1.5"
          style={{ color: isLight ? 'rgba(17,24,39,0.35)' : 'var(--missi-text-muted)' }}
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
                background: i === step
                  ? (isLight ? 'rgba(15,23,42,0.8)' : 'var(--missi-text-secondary)')
                  : (isLight ? 'rgba(15,23,42,0.15)' : 'var(--missi-text-muted)'),
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
              style={{ color: isLight ? 'rgba(17,24,39,0.4)' : 'var(--missi-border)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Skip
            </button>
          )}
          <button
            onClick={handleNext}
            className="px-4 py-1.5 rounded-full text-xs font-medium transition-all hover:opacity-90 active:scale-95"
            style={{
              background: isLight ? '#0f172a' : 'var(--missi-border)',
              color: isLight ? '#fff' : '#000',
              border: 'none', cursor: 'pointer', letterSpacing: '0.01em',
            }}
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
            border: '1px solid var(--missi-border-strong)',
            boxShadow: '0 0 20px var(--missi-text-muted)',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      )}

      {/* Card */}
      <AnimatePresence mode="wait">
        {shouldCenterCard ? (
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
