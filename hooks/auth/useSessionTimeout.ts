import { useEffect, useRef, useCallback } from 'react'
import { useClerk } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'

/**
 * Hook to automatically log a user out after a period of inactivity.
 * Defaults to 30 minutes.
 */
export function useSessionTimeout(timeoutMs: number = 30 * 60 * 1000) {
  const { signOut } = useClerk()
  const router = useRouter()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Track last activity without triggering React re-renders efficiently
  const lastActive = useRef<number>(Date.now())

  const handleLogout = useCallback(async () => {
    try {
      await signOut()
      router.push('/sign-in')
    } catch (e) {
      console.error('Failed to auto-logout due to inactivity', e)
    }
  }, [signOut, router])

  const resetTimer = useCallback(() => {
    lastActive.current = Date.now()
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    timeoutRef.current = setTimeout(() => {
      handleLogout()
    }, timeoutMs)
  }, [timeoutMs, handleLogout])

  useEffect(() => {
    // Initial setup
    resetTimer()

    // Throttle the event listeners so we don't reset the timer on every single mouse movement.
    // Only reset if it's been at least 1 second since the last activity was recorded.
    const activityHandler = () => {
      const now = Date.now()
      if (now - lastActive.current > 1000) {
        resetTimer()
      }
    }

    const events = [
      'mousemove',
      'mousedown',
      'keypress',
      'keydown',
      'touchstart',
      'scroll',
    ]

    events.forEach(event => {
      window.addEventListener(event, activityHandler, { passive: true })
    })

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      events.forEach(event => {
        window.removeEventListener(event, activityHandler)
      })
    }
  }, [resetTimer])
}
