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
 * Wait for speechSynthesis voices to be loaded.
 * On mobile browsers, getVoices() returns [] on the first call — voices
 * load asynchronously and fire the `voiceschanged` event when ready.
 * Returns immediately if voices are already loaded.
 */
function waitForVoices(timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices()
    if (voices.length > 0) {
      resolve(voices)
      return
    }

    let resolved = false
    const onVoicesChanged = () => {
      if (resolved) return
      resolved = true
      speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
      resolve(speechSynthesis.getVoices())
    }

    speechSynthesis.addEventListener("voiceschanged", onVoicesChanged)

    // Don't hang forever — resolve with whatever we have after timeout
    setTimeout(() => {
      if (resolved) return
      resolved = true
      speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
      resolve(speechSynthesis.getVoices())
    }, timeoutMs)
  })
}

/**
 * Pick the best voice from a voice list — prefers Hindi voices for
 * Hindi/Hinglish text, otherwise uses English female voices.
 */
function pickBestVoice(voices: SpeechSynthesisVoice[], text: string): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  // Detect Hindi/Hinglish (contains Devanagari script)
  const hasHindi = /[\u0900-\u097F]/.test(text)

  if (hasHindi) {
    const hindi = voices.find((v) => v.lang.startsWith("hi"))
    if (hindi) return hindi
  }

  // English fallback priority: Samantha (iOS), female, any English
  return (
    voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("samantha")) ||
    voices.find((v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")) ||
    voices.find((v) => v.lang.startsWith("en")) ||
    null
  )
}

/**
 * Speak text using the browser's built-in Web Speech API as fallback.
 * Returns a promise that resolves when speech is done.
 *
 * MOBILE FIX: Waits for voices to load asynchronously before speaking.
 * Without this, mobile browsers get no voice and speak silently.
 */
export async function speakWithWebSpeechAPI(text: string): Promise<void> {
  if (typeof speechSynthesis === "undefined") {
    throw new Error("Web Speech API not available")
  }

  // MOBILE FIX: Wait for voices to actually load before speaking
  const voices = await waitForVoices()

  // Cancel any ongoing speech after awaiting voices to ensure
  // any previous cancel takes effect right before we speak.
  speechSynthesis.cancel()

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = 1.0

    const preferred = pickBestVoice(voices, text)
    if (preferred) utterance.voice = preferred

    // iOS Safari workaround: speechSynthesis sometimes pauses after ~15s.
    // Set a max timeout that resolves the promise regardless.
    let settled = false
    const fallbackTimeout = setTimeout(() => {
      if (settled) return
      settled = true
      speechSynthesis.cancel()
      resolve()
    }, Math.max(text.length * 80, 10000)) // ~80ms/char, min 10s

    utterance.onend = () => {
      if (settled) return
      settled = true
      clearTimeout(fallbackTimeout)
      resolve()
    }
    utterance.onerror = (e) => {
      if (settled) return
      settled = true
      clearTimeout(fallbackTimeout)
      if (e.error === "interrupted" || e.error === "canceled") {
        resolve()
      } else {
        reject(new Error(`Speech synthesis error: ${e.error}`))
      }
    }

    speechSynthesis.speak(utterance)

    // iOS Safari double-check: if speechSynthesis is not speaking after 500ms,
    // it silently failed. Resolve early so the flow continues.
    setTimeout(() => {
      if (!settled && !speechSynthesis.speaking && !speechSynthesis.pending) {
        settled = true
        clearTimeout(fallbackTimeout)
        resolve()
      }
    }, 500)
  })
}
