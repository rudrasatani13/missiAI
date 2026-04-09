import { buildSystemPrompt } from "@/services/ai.service"
import type { Message, PersonalityKey } from "@/types"
import { geminiGenerateStream } from "@/lib/ai/vertex-client"

const DEFAULT_MODEL = "gemini-2.5-pro"

/**
 * Constructs the full Gemini REST request body.
 * Injects sanitized memories via buildSystemPrompt which wraps them
 * between [MEMORY START] / [MEMORY END] and applies personality system prompt.
 */
export function buildGeminiRequest(
  messages: Message[],
  personality: PersonalityKey,
  memories: string,
  model: string = DEFAULT_MODEL,
  maxOutputTokens: number = 600
): Record<string, unknown> {
  const systemPrompt = buildSystemPrompt(personality, memories)

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

  // Google Search grounding is incompatible with Multimodal/Vision requests
  // Only attach it if there are no images in the entire conversation payload.
  if (!hasImage) {
    request.tools = [{ google_search: {} }]
  }

  return request
}

/**
 * Calls Gemini's streamGenerateContent SSE endpoint and returns a
 * ReadableStream that emits text delta strings only.
 *
 * Automatically routes through Vertex AI or Google AI Studio based on
 * the AI_BACKEND environment variable. The apiKey parameter is kept for
 * backward compatibility but is ignored when using Vertex AI.
 */
export async function streamGeminiResponse(
  _apiKey: string,
  model: string,
  requestBody: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ReadableStream<string>> {
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

  return new ReadableStream<string>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()

          if (done) {
            if (buffer.trim()) {
              const lines = buffer.split("\n")
              for (const line of lines) {
                const text = parseSSELine(line)
                if (text) controller.enqueue(text)
              }
            }
            controller.close()
            return
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""

          for (const line of lines) {
            const text = parseSSELine(line)
            if (text) controller.enqueue(text)
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
 * Returns the concatenated text from all parts, or null if no text found.
 */
function parseSSELine(line: string): string | null {
  if (!line.startsWith("data: ")) return null
  const data = line.slice(6).trim()
  if (data === "[DONE]" || data === "") return null
  try {
    const parsed = JSON.parse(data)
    const parts = parsed?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return null
    const text = parts
      .filter((p: any) => typeof p.text === "string")
      .map((p: any) => p.text)
      .join("")
    return text || null
  } catch {
    return null
  }
}
