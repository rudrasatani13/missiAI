"use client"

import { useCallback, useEffect, useState } from "react"
import type { PersonalityKey } from "@/types/chat"

/**
 * Shared chat settings state, persisted to localStorage.
 * Used by the floating shell so the ChatSidebar can render its Settings
 * sub-panel on every page (not just /chat).
 */
export function useChatSettings() {
  const [personality, setPersonalityState] = useState<PersonalityKey>("assistant")
  const [customPrompt, setCustomPromptState] = useState("")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [userName, setUserNameState] = useState("")

  // Hydrate from localStorage after mount
  useEffect(() => {
    try {
      const p = localStorage.getItem("missi-personality") as PersonalityKey | null
      if (p) setPersonalityState(p)
      const cp = localStorage.getItem("missi-custom-prompt")
      if (cp != null) setCustomPromptState(cp)
      const n = localStorage.getItem("missi-user-name")
      if (n) setUserNameState(n)
    } catch {
      // localStorage unavailable (SSR / privacy mode) — use defaults
    }
  }, [])

  const setPersonality = useCallback((key: PersonalityKey) => {
    setPersonalityState(key)
    try {
      localStorage.setItem("missi-personality", key)
    } catch {}
  }, [])

  const setCustomPrompt = useCallback((prompt: string) => {
    setCustomPromptState(prompt)
    try {
      localStorage.setItem("missi-custom-prompt", prompt)
    } catch {}
  }, [])

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((v) => !v)
  }, [])

  const setUserName = useCallback((name: string) => {
    setUserNameState(name)
    try {
      localStorage.setItem("missi-user-name", name)
    } catch {}
  }, [])

  return {
    personality,
    setPersonality,
    customPrompt,
    setCustomPrompt,
    voiceEnabled,
    toggleVoice,
    userName,
    setUserName,
  }
}
