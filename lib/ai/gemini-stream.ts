import { buildSystemPrompt } from "@/services/ai.service"
import type { Message, PersonalityKey } from "@/types"
import { geminiGenerateStream } from "@/lib/ai/vertex-client"
import type { AgentToolCall } from "@/lib/ai/agent-tools"

const DEFAULT_MODEL = "gemini-2.5-pro"

// ─── Parsed SSE Event Types ──────────────────────────────────────────────────

export type GeminiStreamEvent =
  | { type: "text"; text: string }
  | { type: "functionCall"; call: AgentToolCall }
  | { type: "done" }

/**
 * Constructs the full Gemini REST request body.
 * Injects sanitized memories via buildSystemPrompt which wraps them
 * between [MEMORY START] / [MEMORY END] and applies personality system prompt.
 *
 * When `toolDeclarations` is provided, they are injected as Gemini native
 * function calling tools alongside google_search.
 */
export function buildGeminiRequest(
  messages: Message[],
  personality: PersonalityKey,
  memories: string,
  model: string = DEFAULT_MODEL,
  maxOutputTokens: number = 600,
  toolDeclarations?: Record<string, unknown>[],
  customPrompt?: string,
): Record<string, unknown> {
  const systemPrompt = buildSystemPrompt(personality, memories, customPrompt)

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
      temperature: 0.85,
      topP: 0.95,
      topK: 40,
      maxOutputTokens,
    },
  }

  // Build tools array combining Google Search + Function Declarations
  const tools: Record<string, unknown>[] = []

  // Google Search grounding is incompatible with Multimodal/Vision requests
  if (!hasImage) {
    tools.push({ google_search: {} })
  }

  // Inject agent tool declarations when provided
  if (toolDeclarations && toolDeclarations.length > 0) {
    tools.push({ function_declarations: toolDeclarations })
  }

  if (tools.length > 0) {
    request.tools = tools
  }

  return request
}

/**
 * Calls Gemini's streamGenerateContent SSE endpoint and returns a
 * ReadableStream that emits GeminiStreamEvent objects.
 *
 * This replaces the old text-only stream. Events can be:
 * - { type: "text", text: "..." }       — partial text chunk
 * - { type: "functionCall", call: ... }  — model wants to call a tool
 * - { type: "done" }                     — stream finished
 */
export async function streamGeminiResponse(
  _apiKey: string,
  model: string,
  requestBody: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ReadableStream<GeminiStreamEvent>> {
  const res = await geminiGenerateStream(model, requestBody, { signal })

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
 * Returns an array of GeminiStreamEvents (text and/or functionCall).
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
      // Function call part
      if (part.functionCall) {
        events.push({
          type: "functionCall",
          call: {
            name: part.functionCall.name,
            args: part.functionCall.args || {},
          },
        })
      }
    }

    return events
  } catch {
    return []
  }
}
