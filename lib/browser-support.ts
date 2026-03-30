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
