import type { Message } from "@/types"

type GeminiModel = "gemini-3-flash-preview" | "gemini-3.1-flash-lite-preview"

/** Ordered preference — first is primary, rest are fallbacks */
export const MODEL_PRIORITY: GeminiModel[] = [
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite-preview",
]

/**
 * Approximate costs per 1k tokens in USD.
 */
export const MODEL_COSTS: Record<
  GeminiModel,
  { input: number; output: number }
> = {
  "gemini-3-flash-preview": { input: 0.0001, output: 0.0004 },
  "gemini-3.1-flash-lite-preview": { input: 0.00005, output: 0.0002 },
}

/**
 * Select the Gemini model for a request.
 * Returns the primary model. The caller should use getFallbackModel()
 * if the primary returns 503/429.
 */
export function selectGeminiModel(
  _messages: Message[],
  _memories: string
): GeminiModel {
  return MODEL_PRIORITY[0]
}

/**
 * Get the next fallback model after the given one.
 * Returns null if no more fallbacks available.
 */
export function getFallbackModel(currentModel: string): GeminiModel | null {
  const idx = MODEL_PRIORITY.indexOf(currentModel as GeminiModel)
  if (idx === -1 || idx >= MODEL_PRIORITY.length - 1) return null
  return MODEL_PRIORITY[idx + 1]
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
