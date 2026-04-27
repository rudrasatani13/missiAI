"use client"

import { useAuth } from "@clerk/nextjs"
import { useSessionTimeout } from "@/hooks/auth/useSessionTimeout"
import { ReactNode } from "react"

export function SessionGuard({ children }: { children: ReactNode }) {
  const { isSignedIn } = useAuth()
  
  // 30 minutes in milliseconds
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000

  // We conditionally mount the inactivity tracker only if the user is 
  // actually authenticated. If they aren't, the hook is effectively skipped.
  // We wrap the timeout logic in a wrapper component so we don't violate React Rules of Hooks
  // by calling the hook conditionally.
  
  return (
    <>
      {isSignedIn ? <InactivityTracker timeoutMs={SESSION_TIMEOUT_MS} /> : null}
      {children}
    </>
  )
}

function InactivityTracker({ timeoutMs }: { timeoutMs: number }) {
  useSessionTimeout(timeoutMs)
  return null
}
