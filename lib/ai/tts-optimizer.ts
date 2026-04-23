/**
 * Decide whether to invoke TTS for a given response.
 *
 * Returns false (skip TTS) ONLY when:
 *  - Voice is disabled
 *  - Text contains code blocks (``` present)
 *
 * Long responses are handled by truncateForTTS — we still speak them.
 */
export function shouldUseTTS(text: string, voiceEnabled: boolean): boolean {
  if (!voiceEnabled) return false
  if (text.includes("```")) return false
  return true
}

/**
 * Truncate text for TTS: extract the first 4 complete sentences,
 * max 800 chars. Append "..." if truncated.
 */
export function truncateForTTS(text: string): string {
  if (text.length <= 800) return text

  // Split on sentence-ending punctuation followed by a space
  const sentenceEnders = /(?<=[.!?])\s+/
  const sentences = text.split(sentenceEnders)

  if (sentences.length <= 4) {
    return text.slice(0, 800) + "..."
  }

  const truncated = sentences.slice(0, 4).join(" ")
  // BUG-C2 fix: only append "..." when we actually truncated something.
  // Previously this always appended "..." causing TTS playback to speak or pause
  // awkwardly on short responses that happened to have 4+ sentences.
  const wasTruncated = sentences.length > 4
  if (truncated.length > 800) {
    return truncated.slice(0, 800) + "..."
  }
  return wasTruncated ? truncated + "..." : truncated
}
