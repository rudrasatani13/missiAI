"use client"

import { useEffect, useRef, useState } from "react"
import { useChatSettings, type AIDialSettings } from "@/hooks/chat/useChatSettings"
import { getTierSafePersonality } from "@/lib/chat/page-lifecycle"
import { PERSONALITY_OPTIONS, type PersonalityKey } from "@/types/chat"

interface UseChatSettingsSyncOptions {
  billingLoading: boolean
  isLoaded: boolean
  planId: string | null | undefined
}

export function useChatSettingsSync(options: UseChatSettingsSyncOptions) {
  const { billingLoading, isLoaded, planId } = options
  const sharedSettings = useChatSettings()
  const [personality, setPersonality] = useState<PersonalityKey>("assistant")
  const [customPrompt, setCustomPrompt] = useState("")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const personalityRef = useRef<PersonalityKey>("assistant")
  const customPromptRef = useRef("")
  const aiDialsRef = useRef<AIDialSettings | null>(sharedSettings.aiDials)
  const incognitoRef = useRef<boolean>(sharedSettings.privacy.memoryPaused)
  const analyticsOptOutRef = useRef<boolean>(sharedSettings.privacy.analyticsOptOut)

  useEffect(() => {
    aiDialsRef.current = sharedSettings.aiDials
  }, [sharedSettings.aiDials])

  useEffect(() => {
    incognitoRef.current = sharedSettings.privacy.memoryPaused
  }, [sharedSettings.privacy.memoryPaused])

  useEffect(() => {
    analyticsOptOutRef.current = sharedSettings.privacy.analyticsOptOut
  }, [sharedSettings.privacy.analyticsOptOut])

  useEffect(() => {
    setVoiceEnabled(sharedSettings.voiceEnabled)
  }, [sharedSettings.voiceEnabled])

  useEffect(() => {
    const nextPersonality = sharedSettings.personality
    if (nextPersonality && nextPersonality !== personalityRef.current) {
      setPersonality(nextPersonality)
      personalityRef.current = nextPersonality
    }
  }, [sharedSettings.personality])

  useEffect(() => {
    if (sharedSettings.customPrompt !== customPromptRef.current) {
      setCustomPrompt(sharedSettings.customPrompt)
      customPromptRef.current = sharedSettings.customPrompt
    }
  }, [sharedSettings.customPrompt])

  useEffect(() => {
    try {
      const storedPersonality = localStorage.getItem("missi-personality") as PersonalityKey | null
      if (storedPersonality && PERSONALITY_OPTIONS.some((option) => option.key === storedPersonality)) {
        setPersonality(storedPersonality)
        personalityRef.current = storedPersonality
      }
      const storedCustomPrompt = localStorage.getItem("missi-custom-prompt")
      if (storedCustomPrompt) {
        setCustomPrompt(storedCustomPrompt)
        customPromptRef.current = storedCustomPrompt
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (billingLoading || !isLoaded) return

    const safePersonality = getTierSafePersonality(personality, planId)
    if (safePersonality !== personality) {
      setPersonality(safePersonality)
      personalityRef.current = safePersonality
      try {
        localStorage.setItem("missi-personality", safePersonality)
      } catch {}
    }
  }, [billingLoading, isLoaded, personality, planId])

  return {
    aiDialsRef,
    analyticsOptOutRef,
    customPrompt,
    customPromptRef,
    incognitoRef,
    personality,
    personalityRef,
    sharedSettings,
    voiceEnabled,
  }
}
