import type { Message } from "@/types"

type GeminiModel = "gemini-3-flash-preview"

/**
 * Approximate costs per 1k tokens in USD.
 */
export const MODEL_COSTS: Record<
  GeminiModel,
  { input: number; output: number }
> = {
  "gemini-3-flash-preview": { input: 0.0001, output: 0.0004 },
}

/**
 * Select the Gemini model for a request.
 * Now unified on gemini-3-flash-preview — fast and capable for all use cases.
 */
export function selectGeminiModel(
  _messages: Message[],
  _memories: string
): GeminiModel {
  return "gemini-3-flash-preview"
}

/**
 * Estimate the cost of a single request in USD.
 */
export function estimateRequestCost(
  model: GeminiModel,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model] ?? MODEL_COSTS["gemini-3-flash-preview"]
  const inputCost = (inputTokens / 1000) * costs.input
  const outputCost = (outputTokens / 1000) * costs.output
  return inputCost + outputCost
}
