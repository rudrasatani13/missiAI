"use client"

/**
 * Priority-ordered list of audio MIME types to try with MediaRecorder.
 */
const MIME_PRIORITY = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
] as const

interface VoiceSupportedResult {
  supported: true
  mimeType: string
}

interface VoiceUnsupportedResult {
  supported: false
  reason: string
}

export type VoiceSupportResult = VoiceSupportedResult | VoiceUnsupportedResult

/**
 * Checks whether the current browser supports all APIs required for voice
 * recording: navigator.mediaDevices, getUserMedia, and at least one
 * MediaRecorder MIME type.
 */
export function checkVoiceSupport(): VoiceSupportResult {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return { supported: false, reason: "navigator.mediaDevices is not available" }
  }

  if (typeof navigator.mediaDevices.getUserMedia !== "function") {
    return { supported: false, reason: "getUserMedia is not supported in this browser" }
  }

  const mimeType = getBestAudioMimeType()
  if (!mimeType) {
    return {
      supported: false,
      reason: "No supported audio MIME type found for MediaRecorder",
    }
  }

  return { supported: true, mimeType }
}

/**
 * Returns the first MIME type from the priority list that the browser's
 * MediaRecorder supports, or null if none are supported.
 */
export function getBestAudioMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null

  for (const mime of MIME_PRIORITY) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime
    }
  }

  return null
}

/**
 * Detects if the current browser is running on a mobile device.
 * Uses multiple signals for reliable detection across all browsers.
 */
export function isMobileBrowser(): boolean {
  if (typeof navigator === "undefined") return false

  // Check userAgent for common mobile identifiers
  const ua = navigator.userAgent || ""
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i
  if (mobileRegex.test(ua)) return true

  // Check for touch capability + small screen (tablets excluded)
  if ("ontouchstart" in window && window.innerWidth < 768) return true

  // Check for mobile-specific APIs
  if ("maxTouchPoints" in navigator && navigator.maxTouchPoints > 1 && window.innerWidth < 1024) return true

  return false
}

/**
 * Detects if the browser is iOS Safari or any iOS browser (all use WebKit).
 */
export function isIOSBrowser(): boolean {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  return /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
}

/**
 * Speak text using the browser's built-in Web Speech API as fallback.
 * Returns a promise that resolves when speech is done.
 */
export function speakWithWebSpeechAPI(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof speechSynthesis === "undefined") {
      reject(new Error("Web Speech API not available"))
      return
    }

    // Cancel any ongoing speech
    speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = 1.0

    // Try to find a good voice (prefer female English voices)
    const voices = speechSynthesis.getVoices()
    const preferred = voices.find(
      (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")
    ) || voices.find(
      (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("samantha")
    ) || voices.find(
      (v) => v.lang.startsWith("en")
    )

    if (preferred) utterance.voice = preferred

    utterance.onend = () => resolve()
    utterance.onerror = (e) => {
      // 'interrupted' and 'canceled' are not real errors
      if (e.error === "interrupted" || e.error === "canceled") {
        resolve()
      } else {
        reject(new Error(`Speech synthesis error: ${e.error}`))
      }
    }

    speechSynthesis.speak(utterance)

    // iOS Safari workaround: speechSynthesis.speak() sometimes silently fails
    // if called outside a user gesture. Set a timeout to resolve anyway.
    const fallbackTimeout = setTimeout(() => {
      resolve()
    }, Math.max(text.length * 80, 10000)) // rough estimate: 80ms per char, min 10s

    const originalOnEnd = utterance.onend
    utterance.onend = () => {
      clearTimeout(fallbackTimeout)
      if (originalOnEnd) (originalOnEnd as () => void)()
    }
  })
}
