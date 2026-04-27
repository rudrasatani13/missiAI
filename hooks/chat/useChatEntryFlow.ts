"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { getDisplayName } from "@/lib/chat/page-helpers"
import { getBootFlowState, isChatSetupComplete } from "@/lib/chat/page-lifecycle"
import { hasCompletedSetupLocally, markSetupCompleteLocally } from "@/lib/setup/setup-completion"

interface ChatEntryUser {
  firstName?: string | null
  publicMetadata?: { setupComplete?: boolean } | null
}

interface UseChatEntryFlowOptions {
  isLoaded: boolean
  user: ChatEntryUser | null | undefined
  router: { replace: (href: string) => void }
  shouldOpenOnboarding?: () => boolean
}

export function useChatEntryFlow(options: UseChatEntryFlowOptions) {
  const { isLoaded, user, router, shouldOpenOnboarding } = options
  const [localName, setLocalName] = useState("")
  const [showBootSequence, setShowBootSequence] = useState(false)
  const [bootCompleted, setBootCompleted] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const greetedRef = useRef(false)
  const proactiveSpokenRef = useRef(false)

  useEffect(() => {
    try {
      const stored = localStorage.getItem("missi-user-name")
      if (stored) {
        setLocalName(stored)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!isLoaded || !user) return

    const setupDone = isChatSetupComplete(
      user.publicMetadata?.setupComplete,
      hasCompletedSetupLocally(),
    )

    if (setupDone) {
      markSetupCompleteLocally()
      return
    }

    router.replace("/setup")
  }, [isLoaded, user, router])

  useEffect(() => {
    try {
      const isNewUser = new URLSearchParams(window.location.search).get("new") === "true"
      const next = getBootFlowState(isNewUser, Boolean(localStorage.getItem("missi-boot-v1")))
      setShowBootSequence(next.showBootSequence)
      setBootCompleted(next.bootCompleted)
    } catch {
      setBootCompleted(true)
    }
  }, [])

  useEffect(() => {
    try {
      greetedRef.current = sessionStorage.getItem("missi-greeted") === "1"
      proactiveSpokenRef.current = sessionStorage.getItem("missi-proactive-spoken") === "1"
    } catch {}
  }, [])

  const completeBootSequence = useCallback(() => {
    try {
      localStorage.setItem("missi-boot-v1", "true")
    } catch {}
    setBootCompleted(true)
    if (shouldOpenOnboarding?.()) {
      setShowOnboarding(true)
    }
  }, [shouldOpenOnboarding])

  const dismissOnboarding = useCallback(() => {
    setShowOnboarding(false)
  }, [])

  const resetGreetingSession = useCallback(() => {
    try {
      sessionStorage.removeItem("missi-greeted")
    } catch {}
    greetedRef.current = false
  }, [])

  return {
    bootCompleted,
    completeBootSequence,
    dismissOnboarding,
    displayName: getDisplayName(user?.firstName, localName),
    greetedRef,
    proactiveSpokenRef,
    resetGreetingSession,
    showBootSequence,
    showOnboarding,
  }
}
