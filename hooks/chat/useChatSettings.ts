"use client"

import { useCallback, useEffect, useState } from "react"
import type { PersonalityKey } from "@/types/chat"

// ──────────────────────────────────────────────────────────────────────────────
// Extended settings shapes — surfaced on the new /settings full-page.
// All values persist to localStorage under individual keys so we remain
// backwards-compatible with the old sidebar sub-panel storage.
// ──────────────────────────────────────────────────────────────────────────────

export type ThemeMode = "dark" | "light" | "system"
export type AccentColor = "amber" | "blue" | "purple" | "pink" | "green"
export type FontScale = "sm" | "md" | "lg"
export type ResponseLength = "short" | "medium" | "long"

export interface AppearanceSettings {
  theme: ThemeMode
  accent: AccentColor
  fontScale: FontScale
  reduceMotion: boolean
  highContrast: boolean
}

export interface PrivacySettings {
  memoryPaused: boolean // incognito mode — chat doesn't extract/store life-graph nodes
  analyticsOptOut: boolean
}

export interface NotificationSettings {
  quietHoursEnabled: boolean
  quietHoursStart: string // "22:00"
  quietHoursEnd: string // "08:00"
  notifyCheckIn: boolean
}

export interface AIDialSettings {
  responseLength: ResponseLength
  warmth: number // 0-100
  humor: number // 0-100
  formality: number // 0-100
  creativity: number // 0-100
}

// Defaults kept in one place so the Settings page can also offer a
// "Reset to defaults" action without duplicating literals.
export const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "light",
  accent: "amber",
  fontScale: "md",
  reduceMotion: false,
  highContrast: false,
}

export const DEFAULT_PRIVACY: PrivacySettings = {
  memoryPaused: false,
  analyticsOptOut: false,
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  notifyCheckIn: true,
}

export const DEFAULT_AI_DIALS: AIDialSettings = {
  responseLength: "medium",
  warmth: 70,
  humor: 50,
  formality: 40,
  creativity: 60,
}

// localStorage keys — grouped under `missi-*` prefix to match existing style.
const LS_APPEARANCE = "missi-appearance"
const LS_PRIVACY = "missi-privacy"
const LS_NOTIFICATIONS = "missi-notifications"
const LS_AI_DIALS = "missi-ai-dials"

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    // Merge against fallback so newly-added fields don't blow up on old saves.
    return { ...fallback, ...parsed }
  } catch {
    return fallback
  }
}

function writeJSON<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable — silently skip; state is still in-memory.
  }
  broadcastChange(key)
}

/**
 * Broadcast a same-tab change so every `useChatSettings()` consumer (and the
 * AppearanceProvider) rehydrates without a page reload. The native `storage`
 * event only fires in OTHER tabs, so we need this custom event for the current
 * tab. The detail carries the key that changed so listeners can filter.
 */
export const SETTINGS_CHANGED_EVENT = "missi-settings-changed"

function broadcastChange(key: string) {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(
      new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: { key } }),
    )
  } catch {
    // Older browsers may not support CustomEvent constructor — no-op.
  }
}

function writeString(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // no-op
  }
  broadcastChange(key)
}

/**
 * Shared chat settings state, persisted to localStorage.
 * Used by the floating shell so the ChatSidebar can render its Settings
 * sub-panel on every page, AND by the dedicated /settings full-page.
 */
export function useChatSettings() {
  const [personality, setPersonalityState] = useState<PersonalityKey>("assistant")
  const [customPrompt, setCustomPromptState] = useState("")
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [userName, setUserNameState] = useState("")

  // New grouped settings.
  const [appearance, setAppearanceState] = useState<AppearanceSettings>(DEFAULT_APPEARANCE)
  const [privacy, setPrivacyState] = useState<PrivacySettings>(DEFAULT_PRIVACY)
  const [notifications, setNotificationsState] = useState<NotificationSettings>(DEFAULT_NOTIFICATIONS)
  const [aiDials, setAIDialsState] = useState<AIDialSettings>(DEFAULT_AI_DIALS)

  // Hydrate from localStorage after mount, and subscribe to same-tab /
  // cross-tab changes so multiple consumers stay in sync without a reload.
  useEffect(() => {
    const hydrate = () => {
      try {
        const p = localStorage.getItem("missi-personality") as PersonalityKey | null
        if (p) setPersonalityState(p)
        else setPersonalityState("assistant")
        const cp = localStorage.getItem("missi-custom-prompt")
        setCustomPromptState(cp ?? "")
        const n = localStorage.getItem("missi-user-name")
        setUserNameState(n ?? "")
        const v = localStorage.getItem("missi-voice-enabled")
        if (v != null) setVoiceEnabled(v === "1")
      } catch {
        // localStorage unavailable (SSR / privacy mode) — use defaults
      }
      setAppearanceState(readJSON(LS_APPEARANCE, DEFAULT_APPEARANCE))
      setPrivacyState(readJSON(LS_PRIVACY, DEFAULT_PRIVACY))
      setNotificationsState(readJSON(LS_NOTIFICATIONS, DEFAULT_NOTIFICATIONS))
      setAIDialsState(readJSON(LS_AI_DIALS, DEFAULT_AI_DIALS))
    }

    hydrate()

    const onStorage = (e: StorageEvent) => {
      if (!e.key || !e.key.startsWith("missi-")) return
      hydrate()
    }
    const onSameTab = () => hydrate()

    window.addEventListener("storage", onStorage)
    window.addEventListener(SETTINGS_CHANGED_EVENT, onSameTab as EventListener)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(SETTINGS_CHANGED_EVENT, onSameTab as EventListener)
    }
  }, [])

  const setPersonality = useCallback((key: PersonalityKey) => {
    setPersonalityState(key)
    writeString("missi-personality", key)
  }, [])

  const setCustomPrompt = useCallback((prompt: string) => {
    setCustomPromptState(prompt)
    writeString("missi-custom-prompt", prompt)
  }, [])

  const toggleVoice = useCallback(() => {
    setVoiceEnabled((v) => {
      const next = !v
      writeString("missi-voice-enabled", next ? "1" : "0")
      return next
    })
  }, [])

  const setUserName = useCallback((name: string) => {
    setUserNameState(name)
    writeString("missi-user-name", name)
  }, [])

  const updateAppearance = useCallback((patch: Partial<AppearanceSettings>) => {
    setAppearanceState((prev) => {
      const next = { ...prev, ...patch }
      writeJSON(LS_APPEARANCE, next)
      return next
    })
  }, [])

  const updatePrivacy = useCallback((patch: Partial<PrivacySettings>) => {
    setPrivacyState((prev) => {
      const next = { ...prev, ...patch }
      writeJSON(LS_PRIVACY, next)
      return next
    })
  }, [])

  const updateNotifications = useCallback((patch: Partial<NotificationSettings>) => {
    setNotificationsState((prev) => {
      const next = { ...prev, ...patch }
      writeJSON(LS_NOTIFICATIONS, next)
      return next
    })
  }, [])

  const updateAIDials = useCallback((patch: Partial<AIDialSettings>) => {
    setAIDialsState((prev) => {
      const next = { ...prev, ...patch }
      writeJSON(LS_AI_DIALS, next)
      return next
    })
  }, [])

  const resetAIDials = useCallback(() => {
    setAIDialsState(DEFAULT_AI_DIALS)
    writeJSON(LS_AI_DIALS, DEFAULT_AI_DIALS)
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
    appearance,
    updateAppearance,
    privacy,
    updatePrivacy,
    notifications,
    updateNotifications,
    aiDials,
    updateAIDials,
    resetAIDials,
  }
}
