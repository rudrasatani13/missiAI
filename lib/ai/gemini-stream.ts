import { buildSystemPrompt } from "@/services/ai.service"
import type { Message, PersonalityKey } from "@/types"

const DEFAULT_MODEL = "gemini-3-flash-preview"

/**
 * Constructs the full Gemini REST request body.
 * Injects sanitized memories via buildSystemPrompt which wraps them
 * between [MEMORY START] / [MEMORY END] and applies personality system prompt.
 */
export function buildGeminiRequest(
  messages: Message[],
  personality: PersonalityKey,
  memories: string,
  model: string = DEFAULT_MODEL
): Record<string, unknown> {
  const systemPrompt = buildSystemPrompt(personality, memories)

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }))

  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 4096,
    },
    tools: [{ google_search: {} }],
  }
}

/**
 * Calls Gemini's streamGenerateContent SSE endpoint and returns a
 * ReadableStream that emits text delta strings only.
 *
 * API key is passed via x-goog-api-key header (NOT as ?key= URL param)
 * to avoid exposing the key in URLs / logs.
 */
export async function streamGeminiResponse(
  apiKey: string,
  model: string,
  requestBody: Record<string, unknown>,
  signal?: AbortSignal
): Promise<ReadableStream<string>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify(requestBody),
    signal,
  })

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
