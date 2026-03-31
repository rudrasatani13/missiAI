import type { Message } from "@/types"

type GeminiModel = "gemini-2.5-pro" | "gemini-2.0-flash-lite"

/**
 * Approximate costs per 1k tokens in USD.
 */
export const MODEL_COSTS: Record<
  GeminiModel,
  { input: number; output: number }
> = {
  "gemini-2.5-pro": { input: 0.00125, output: 0.01 },
  "gemini-2.0-flash-lite": { input: 0.000075, output: 0.0003 },
}

/**
 * Pick the cheapest Gemini model that can handle the request.
 *
 * Use the LITE model when ALL of these are true:
 *  - Latest user message is under 80 chars
 *  - No memories injected (empty facts string)
 *  - Conversation is under 4 turns (messages.length < 4)
 *
 * Otherwise fall back to the full PRO model.
 */
export function selectGeminiModel(
  messages: Message[],
  memories: string
): GeminiModel {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")
  const lastUserContent = lastUserMsg?.content ?? ""

  const isShortMessage = lastUserContent.length < 80
  const hasNoMemories = !memories.trim()
  const isShortConversation = messages.length < 4

  if (isShortMessage && hasNoMemories && isShortConversation) {
    return "gemini-2.0-flash-lite"
  }

  return "gemini-2.5-pro"
}

/**
 * Estimate the cost of a single request in USD.
 */
export function estimateRequestCost(
  model: GeminiModel,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model] ?? MODEL_COSTS["gemini-2.5-pro"]
  const inputCost = (inputTokens / 1000) * costs.input
  const outputCost = (outputTokens / 1000) * costs.output
  return inputCost + outputCost
}
