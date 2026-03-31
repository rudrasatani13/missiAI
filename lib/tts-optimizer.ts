/**
 * Decide whether to invoke ElevenLabs TTS for a given response.
 *
 * Returns false (skip TTS) when:
 *  - Voice is disabled
 *  - Text is over 800 chars (too long for good TTS UX)
 *  - Text contains code blocks (``` present)
 *  - Text is purely a list (>3 lines starting with - or *)
 */
export function shouldUseTTS(text: string, voiceEnabled: boolean): boolean {
  if (!voiceEnabled) return false
  if (text.length > 800) return false
  if (text.includes("```")) return false

  // Check if text is predominantly a list
  const lines = text.split("\n").filter((l) => l.trim().length > 0)
  const listLines = lines.filter((l) => /^\s*[-*]/.test(l))
  if (listLines.length > 3) return false

  return true
}

/**
 * Truncate text for TTS: if over 400 chars, extract only the first
 * 2 complete sentences. Append "..." if truncated.
 */
export function truncateForTTS(text: string): string {
  if (text.length <= 400) return text

  // Split on sentence-ending punctuation followed by a space
  const sentenceEnders = /(?<=[.!?])\s+/
  const sentences = text.split(sentenceEnders)

  if (sentences.length <= 2) {
    // Can't split further — just hard-cut at 400 chars
    return text.slice(0, 400) + "..."
  }

  const truncated = sentences.slice(0, 2).join(" ")
  return truncated + "..."
}
