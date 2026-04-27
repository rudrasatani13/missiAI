/**
 * Provider Router — Multi-provider inference with health-aware fallback.
 *
 * Primary: Vertex AI / Gemini (via `streamGeminiResponseViaVertex`)
 * Fallback: OpenAI (via `streamOpenAIResponse`)
 *
 * Usage:
 *   const stream = await streamChat(model, requestBody, signal)
 *   // stream emits GeminiStreamEvent shaped events regardless of provider
 */

import type { GeminiStreamEvent } from "@/lib/ai/providers/gemini-stream"
import { streamGeminiResponseViaVertex, vertexHealthCheck } from "@/lib/ai/providers/gemini-stream"
import { streamOpenAIResponse, openAIHealthCheck, isOpenAIFallbackEnabled } from "@/lib/ai/providers/openai-stream"
import { logError } from "@/lib/server/observability/logger"
import {
  recordProviderOutcome,
  getProviderHealthSummary,
  resetProviderHealthState,
  type ProviderHealth,
} from "@/lib/server/observability/chat-health"

export interface ChatStreamParams {
  model: string
  requestBody: Record<string, unknown>
  signal?: AbortSignal
  userId?: string
}

export interface ProviderHealthStatus {
  vertex: ProviderHealth
  openai: ProviderHealth
}

function isVertexErrorRetryable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message
  return msg.includes("503") || msg.includes("429") || msg.includes("timeout") || msg.includes("aborted")
}

function measureLatency<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const start = Date.now()
  return fn().then((result) => ({ result, latencyMs: Date.now() - start }))
}

function applyProbeResult(
  summary: ProviderHealth,
  probe: { healthy: boolean; latencyMs: number } | null,
): ProviderHealth {
  if (!probe) {
    return summary
  }

  return {
    ...summary,
    healthy: probe.healthy,
    latencyMs: probe.latencyMs,
    lastCheckedAt: Date.now(),
  }
}

/**
 * Stream chat inference with automatic provider fallback.
 *
 * 1. Try Vertex AI first (primary).
 * 2. If Vertex fails with a retryable error (503, 429, timeout, abort)
 *    and OpenAI fallback is enabled, switch to OpenAI.
 * 3. If OpenAI also fails, throw the original Vertex error.
 */
export async function streamChat(
  params: ChatStreamParams,
): Promise<ReadableStream<GeminiStreamEvent>> {
  const { model, requestBody, signal, userId } = params

  // Try primary provider (Vertex)
  try {
    const { result: stream, latencyMs } = await measureLatency(() =>
      streamGeminiResponseViaVertex(model, requestBody, signal)
    )
    recordProviderOutcome("vertex", true, latencyMs)
    return stream
  } catch (primaryErr) {
    recordProviderOutcome("vertex", false, 0)
    logError(
      "provider.vertex_failure",
      primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
    )

    // Decide whether to fall back
    if (!isOpenAIFallbackEnabled()) {
      throw primaryErr
    }

    if (!isVertexErrorRetryable(primaryErr)) {
      throw primaryErr
    }

    // Fallback to OpenAI
    if (userId) {
      logError("provider.fallback_to_openai", `Falling back to OpenAI for ${model}`, userId)
    }

    try {
      const { result: stream, latencyMs } = await measureLatency(() =>
        streamOpenAIResponse(model, requestBody, signal)
      )
      recordProviderOutcome("openai", true, latencyMs)
      return stream
    } catch {
      recordProviderOutcome("openai", false, 0)
      // Surface the original Vertex error — it's the root cause
      throw primaryErr
    }
  }
}

/**
 * Lightweight background health check for both providers.
 * Can be called from a health endpoint or cron.
 * Does not block inference.
 */
export function getProviderHealthSnapshot(): ProviderHealthStatus {
  return {
    vertex: getProviderHealthSummary("vertex"),
    openai: getProviderHealthSummary("openai"),
  }
}

export async function checkProviderHealth(
  options?: { forceOpenAIProbe?: boolean },
): Promise<ProviderHealthStatus> {
  const openaiSummary = getProviderHealthSummary("openai")
  const shouldProbeOpenAI = options?.forceOpenAIProbe || !openaiSummary.healthy

  const [vertexProbe, openaiProbe] = await Promise.all([
    vertexHealthCheck(),
    shouldProbeOpenAI ? openAIHealthCheck() : Promise.resolve(null),
  ])

  recordProviderOutcome("vertex", vertexProbe.healthy, vertexProbe.latencyMs)
  if (openaiProbe) {
    recordProviderOutcome("openai", openaiProbe.healthy, openaiProbe.latencyMs)
  }

  const snapshot = getProviderHealthSnapshot()

  return {
    vertex: applyProbeResult(snapshot.vertex, vertexProbe),
    openai: applyProbeResult(snapshot.openai, openaiProbe),
  }
}

/**
 * Force a fresh health check for OpenAI (useful for admin/ops endpoints).
 */
export async function checkOpenAIHealth(): Promise<ProviderHealth> {
  const probe = await openAIHealthCheck()
  recordProviderOutcome("openai", probe.healthy, probe.latencyMs)
  return applyProbeResult(getProviderHealthSummary("openai"), probe)
}

/**
 * Reset health state — useful in tests or after a known outage recovery.
 */
export function resetProviderHealth(): void {
  resetProviderHealthState()
}
