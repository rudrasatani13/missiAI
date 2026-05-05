/**
 * OpenAI Streaming Provider — Fallback when Vertex AI is unavailable.
 *
 * Converts Gemini-format request bodies to OpenAI's chat.completions
 * streaming API, then re-emits events in our internal `GeminiStreamEvent`
 * shape so runners don't need to change.
 *
 * Model mapping (Gemini → OpenAI):
 *   gemini-2.5-flash  → gpt-4o-mini
 *   gemini-2.5-pro    → gpt-4o
 *   everything else   → gpt-4o
 *
 * ⚠️  This is a **degraded fallback** — agent tool calling is not supported
 *     in OpenAI mode yet. Only text streaming is available.
 */

import type { GeminiStreamEvent } from "@/lib/ai/providers/gemini-stream"
import { envExists } from "@/lib/server/platform/env"

const OPENAI_API_BASE = "https://api.openai.com/v1/chat/completions"

const GEMINI_TO_OPENAI_MODEL: Record<string, string> = {
  "gemini-2.5-flash": "gpt-4o-mini",
  "gemini-2.5-pro": "gpt-4o",
  "gemini-3-flash-preview": "gpt-4o-mini",
  "gemini-3.1-flash-lite-preview": "gpt-4o-mini",
}

function mapGeminiModelToOpenAI(geminiModel: string): string {
  return GEMINI_TO_OPENAI_MODEL[geminiModel] ?? "gpt-4o"
}

/**
 * Convert a Gemini request body (as built by `buildGeminiRequest`) into
 * an OpenAI chat.completions request body.
 */
export function convertGeminiRequestToOpenAI(
  geminiModel: string,
  geminiBody: Record<string, unknown>,
): Record<string, unknown> {
  const openaiModel = mapGeminiModelToOpenAI(geminiModel)

  // Extract system prompt
  const systemInstruction = geminiBody.system_instruction as
    | { parts: { text: string }[] }
    | undefined
  const systemContent = systemInstruction?.parts?.[0]?.text ?? ""

  // Extract generation config
  const genConfig = (geminiBody.generationConfig as Record<string, unknown>) || {}
  const temperature = typeof genConfig.temperature === "number" ? genConfig.temperature : 0.85
  const maxTokens = typeof genConfig.maxOutputTokens === "number" ? genConfig.maxOutputTokens : 600

  // Convert Gemini contents to OpenAI messages
  const geminiContents = (geminiBody.contents as Array<{ role: string; parts: any[] }>) || []
  const messages: Array<{ role: string; content: string | unknown[] }> = []

  if (systemContent) {
    messages.push({ role: "system", content: systemContent })
  }

  for (const content of geminiContents) {
    const role = content.role === "model" ? "assistant" : "user"
    const parts = content.parts || []

    // Check if any part is an inline image
    const imagePart = parts.find((p) => p.inlineData)
    const textParts = parts.filter((p) => typeof p.text === "string")

    if (imagePart) {
      // OpenAI vision format
      const imageData = imagePart.inlineData as { mimeType?: string; data?: string }
      const mime = imageData.mimeType || "image/jpeg"
      const base64 = imageData.data || ""
      const contentParts: unknown[] = textParts.map((p) => ({
        type: "text",
        text: p.text,
      }))
      contentParts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${base64}` },
      })
      messages.push({ role, content: contentParts })
    } else {
      const text = textParts.map((p) => p.text).join("")
      messages.push({ role, content: text })
    }
  }

  return {
    model: openaiModel,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  }
}

/**
 * Call OpenAI's streaming completions endpoint and return a ReadableStream
 * that emits `GeminiStreamEvent` shaped events.
 */
export async function streamOpenAIResponse(
  geminiModel: string,
  geminiBody: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<ReadableStream<GeminiStreamEvent>> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured")
  }

  const openaiBody = convertGeminiRequestToOpenAI(geminiModel, geminiBody)

  const res = await fetch(OPENAI_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(openaiBody),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "")
    throw new Error(`OpenAI API error ${res.status}: ${errText}`)
  }

  if (!res.body) {
    throw new Error("No response body from OpenAI")
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  return new ReadableStream<GeminiStreamEvent>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            if (buffer.trim()) {
              const lines = buffer.split("\n")
              for (const line of lines) {
                const events = parseOpenAISSELine(line)
                for (const event of events) controller.enqueue(event)
              }
            }
            controller.enqueue({ type: "done" })
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const events = parseOpenAISSELine(line)
            for (const event of events) controller.enqueue(event)
          }
        }
      } catch (e) {
        controller.error(e)
      }
    },
    cancel() {
      reader.cancel()
    },
  })
}

/**
 * Parse a single SSE line from OpenAI's stream response.
 * Returns GeminiStreamEvent[] (text events only — no function calls).
 */
function parseOpenAISSELine(line: string): GeminiStreamEvent[] {
  if (!line.startsWith("data: ")) return []
  const data = line.slice(6).trim()
  if (data === "[DONE]" || data === "") return []

  try {
    const parsed = JSON.parse(data)
    const choices = parsed?.choices
    if (!Array.isArray(choices) || choices.length === 0) return []

    const delta = choices[0]?.delta
    if (!delta) return []

    const events: GeminiStreamEvent[] = []

    // Text content
    if (typeof delta.content === "string" && delta.content) {
      events.push({ type: "text", text: delta.content })
    }

    // Tool calls are ignored in fallback mode (degraded service)
    // They appear as delta.tool_calls which we deliberately skip.

    // Finish reason signals completion of this chunk
    if (choices[0]?.finish_reason) {
      events.push({ type: "done" })
    }

    return events
  } catch {
    return []
  }
}

/**
 * Lightweight health check — makes a tiny non-streaming request to OpenAI.
 * Returns latency in ms. Throws on failure.
 */
export async function openAIHealthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return { healthy: false, latencyMs: 0 }
  }

  const start = Date.now()
  try {
    const res = await fetch(OPENAI_API_BASE, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(5_000),
    })

    return { healthy: res.ok, latencyMs: Date.now() - start }
  } catch {
    return { healthy: false, latencyMs: Date.now() - start }
  }
}

/**
 * Whether OpenAI fallback is globally enabled.
 *
 * Default: DISABLED — must be explicitly opted in by setting
 * ENABLE_OPENAI_FALLBACK=true in the environment.
 * This prevents automatic escalation to a higher-cost provider.
 */
export function isOpenAIFallbackEnabled(): boolean {
  const envVal = process.env.ENABLE_OPENAI_FALLBACK
  if (!envExists("OPENAI_API_KEY")) return false
  return envVal === "true" || envVal === "1"
}
