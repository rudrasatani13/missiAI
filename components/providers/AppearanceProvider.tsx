"use client"

/**
 * AppearanceProvider
 *
 * Reads the user's appearance settings from localStorage (key: `missi-appearance`)
 * and applies them to <html> as data-* attributes. The actual visual effect is
 * driven by CSS rules in `globals.css` that key off those attributes.
 *
 * It listens for:
 *   • the native `storage` event  — picks up changes made in other tabs
 *   • a custom `missi-settings-changed` event — picks up same-tab changes
 *     dispatched by `useChatSettings` when any of its setters run
 *
 * This must be mounted once near the root (see `app/providers.tsx`) so that
 * settings apply globally regardless of the route.
 */

import { useEffect } from "react"
import {
  DEFAULT_APPEARANCE,
  type AppearanceSettings,
} from "@/hooks/chat/useChatSettings"

const LS_KEY = "missi-appearance"

function readAppearance(): AppearanceSettings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_APPEARANCE
    const parsed = JSON.parse(raw)
    return { ...DEFAULT_APPEARANCE, ...parsed }
  } catch {
    return DEFAULT_APPEARANCE
  }
}

function resolveTheme(theme: AppearanceSettings["theme"]): "light" | "dark" {
  if (theme === "system") {
    if (typeof window === "undefined") return "light"
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  }
  return theme
}

function applyAppearance(a: AppearanceSettings) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const resolved = resolveTheme(a.theme)
  root.setAttribute("data-theme", resolved)
  // Keep Tailwind dark class in sync for shadcn/ui components
  if (resolved === "dark") {
    root.classList.add("dark")
  } else {
    root.classList.remove("dark")
  }
  root.setAttribute("data-accent", a.accent)
  root.setAttribute("data-font-scale", a.fontScale)
  root.setAttribute("data-reduce-motion", String(a.reduceMotion))
  root.setAttribute("data-high-contrast", String(a.highContrast))
}

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyAppearance(readAppearance())
    const media = window.matchMedia("(prefers-color-scheme: dark)")

    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) applyAppearance(readAppearance())
    }
    const onSettingsChanged = () => applyAppearance(readAppearance())
    const onSystemThemeChange = () => applyAppearance(readAppearance())

    window.addEventListener("storage", onStorage)
    window.addEventListener("missi-settings-changed", onSettingsChanged as EventListener)
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onSystemThemeChange)
    } else {
      media.addListener(onSystemThemeChange)
    }
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("missi-settings-changed", onSettingsChanged as EventListener)
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", onSystemThemeChange)
      } else {
        media.removeListener(onSystemThemeChange)
      }
    }
  }, [])

  return <>{children}</>
}
