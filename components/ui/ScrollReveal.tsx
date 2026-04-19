'use client'

import { useRef, type ReactNode, type CSSProperties } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'

type ScrollRevealProps = {
  children: ReactNode
  delay?: number
  y?: number
  className?: string
  style?: CSSProperties
  as?: 'div' | 'section' | 'article' | 'header' | 'footer' | 'aside'
  /** Margin passed to IntersectionObserver. Triggers slightly before entering. */
  margin?: string
  /** If false, animation will replay every time element leaves/enters. Defaults true. */
  once?: boolean
}

/**
 * Minimal, unified scroll-reveal wrapper.
 * - One consistent easing + duration across the app.
 * - Respects prefers-reduced-motion (fades only, no translate).
 * - Uses IntersectionObserver via framer-motion's useInView.
 */
export function ScrollReveal({
  children,
  delay = 0,
  y = 16,
  className,
  style,
  as = 'div',
  margin = '-10% 0px',
  once = true,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once, margin: margin as any })
  const reduceMotion = useReducedMotion()

  const MotionTag = motion[as] as typeof motion.div

  return (
    <MotionTag
      ref={ref as any}
      initial={{ opacity: 0, y: reduceMotion ? 0 : y }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: reduceMotion ? 0 : y }}
      transition={{ duration: 0.45, delay, ease: [0.16, 1, 0.3, 1] }}
      className={className}
      style={style}
    >
      {children}
    </MotionTag>
  )
}

export default ScrollReveal
