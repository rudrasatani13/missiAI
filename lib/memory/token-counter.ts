import type { ConversationEntry } from "@/types/chat"

const CHARS_PER_TOKEN = 4

/**
 * Approximate token count: ~4 chars per token, rounded up.
 * Good enough for budget guards without a tiktoken dependency.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/**
 * Estimate total request tokens across all messages, system prompt, and memories.
 * Adds a 10% overhead buffer for safety (formatting, special tokens, etc.).
 */
export function estimateRequestTokens(
  messages: { role: string; content: string }[],
  systemPrompt: string,
  memories: string
): number {
  let total = estimateTokens(systemPrompt)
  total += estimateTokens(memories)
  for (const msg of messages) {
    total += estimateTokens(msg.content)
  }
  return Math.ceil(total * 1.1)
}

/** Token budget constants */
export const LIMITS = {
  MAX_REQUEST_TOKENS: 30000,
  MAX_RESPONSE_TOKENS: 2048,
  WARN_THRESHOLD: 25000,
} as const

/**
 * Remove oldest messages until estimated tokens fall below `limit`.
 * Always keeps:
 *  - The very last message (latest user turn)
 *  - At minimum 4 messages total
 */
export function truncateToTokenLimit(
  messages: ConversationEntry[],
  limit: number
): ConversationEntry[] {
  if (messages.length <= 4) return messages

  const result = [...messages]

  while (result.length > 4) {
    const estimated = result.reduce(
      (sum, m) => sum + estimateTokens(m.content),
      0
    )
    if (estimated <= limit) break
    // Remove the oldest message (index 0), keeping the tail intact
    result.splice(0, 1)
  }

  return result
}
