import { buildSystemPrompt, dialsToTemperature, dialsToMaxTokens, type AIDialsInput } from "@/lib/ai/services/ai-service"
import type { Message, PersonalityKey } from "@/types"
import { vertexGeminiGenerate, vertexGeminiGenerateStream } from "@/lib/ai/providers/vertex-client"

const DEFAULT_MODEL = "gemini-2.5-pro"
const HEALTH_CHECK_MODEL = "gemini-2.5-flash"

// ─── Parsed SSE Event Types ──────────────────────────────────────────────────

export type GeminiStreamEvent =
  | { type: "text"; text: string }
  | { type: "done" }

/**
 * Constructs the full Gemini REST request body.
 * Injects sanitized memories via buildSystemPrompt which wraps them
 * between [MEMORY START] / [MEMORY END] and applies personality system prompt.
 */
export function buildGeminiRequest(
  messages: Message[],
  personality: PersonalityKey,
  memories: string,
  _model: string = DEFAULT_MODEL,
  maxOutputTokens: number = 600,
  customPrompt?: string,
  /** Pre-built system prompt — skips buildSystemPrompt if provided */
  systemPromptOverride?: string,
  /**
   * User-tuned Behavior Dials. When present they influence BOTH the system
   * prompt (via `buildSystemPrompt`) and the Gemini generation config
   * (temperature from `creativity`, maxOutputTokens from `responseLength`).
   */
  aiDials?: AIDialsInput,
): Record<string, unknown> {
  const systemPrompt = systemPromptOverride || buildSystemPrompt(personality, memories, customPrompt, aiDials)

  const contents = messages.map((m) => {
    const parts: any[] = [{ text: m.content }]
    if (m.image) {
      const match = m.image.match(/^data:(image\/[a-zA-Z]+);base64,(.+)$/)
      if (match) {
        parts.unshift({
          inlineData: {
            mimeType: match[1],
            data: match[2],
          }
        })
      } else {
        parts.unshift({
          inlineData: {
            mimeType: "image/jpeg",
            data: m.image,
          }
        })
      }
    }
    return {
      role: m.role === "assistant" ? "model" : "user",
      parts,
    }
  })

  const hasImage = messages.some((m) => !!m.image)

  const request: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      // Creativity dial (0–100) maps to temperature 0.2–1.2; defaults to 0.85
      temperature: dialsToTemperature(aiDials, 0.85),
      topP: 0.95,
      topK: 40,
      // Response length dial overrides caller's maxOutputTokens for
      // "short"/"long"; "medium" or absent leaves caller's value untouched.
      maxOutputTokens: dialsToMaxTokens(aiDials, maxOutputTokens),
    },
  }

  const tools: Record<string, unknown>[] = []

  // Google Search grounding is incompatible with Multimodal/Vision requests
  if (!hasImage) {
    tools.push({ google_search: {} })
  }

  if (tools.length > 0) {
    request.tools = tools
  }

  return request
}

export async function vertexHealthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
  const start = Date.now()

  try {
    const res = await vertexGeminiGenerate(
      HEALTH_CHECK_MODEL,
      {
        contents: [{ role: "user", parts: [{ text: "Hi" }] }],
        generationConfig: {
          maxOutputTokens: 1,
          temperature: 0,
        },
      },
      { signal: AbortSignal.timeout(5_000) },
    )

    return { healthy: res.ok, latencyMs: Date.now() - start }
  } catch {
    return { healthy: false, latencyMs: Date.now() - start }
  }
}

/**
 * Calls Gemini's streamGenerateContent SSE endpoint and returns a
 * ReadableStream that emits GeminiStreamEvent objects.
 */
export async function streamGeminiResponse(
  model: string,
  requestBody: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ReadableStream<GeminiStreamEvent>> {
  return streamGeminiResponseViaVertex(model, requestBody, signal)
}

export async function streamGeminiResponseViaVertex(
  model: string,
  requestBody: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ReadableStream<GeminiStreamEvent>> {
  const res = await vertexGeminiGenerateStream(model, requestBody, { signal })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Gemini API error ${res.status}: ${errText}`)
  }

  if (!res.body) {
    throw new Error("No response body from Gemini")
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
                const events = parseSSELine(line)
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
            const events = parseSSELine(line)
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
 * Parse a single SSE line from Gemini's streamGenerateContent response.
 */
function parseSSELine(line: string): GeminiStreamEvent[] {
  if (!line.startsWith("data: ")) return []
  const data = line.slice(6).trim()
  if (data === "[DONE]" || data === "") return []
  try {
    const parsed = JSON.parse(data)
    const parts = parsed?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return []

    const events: GeminiStreamEvent[] = []

    for (const part of parts) {
      // Text part
      if (typeof part.text === "string" && part.text) {
        events.push({ type: "text", text: part.text })
      }
    }

    return events
  } catch {
    return []
  }
}
