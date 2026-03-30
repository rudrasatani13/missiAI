import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/auth"
import { chatSchema, validationErrorResponse } from "@/lib/schemas"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { getUserMemoryStore, getRelevantFacts, formatFactsForPrompt } from "@/lib/kv-memory"
import { buildGeminiRequest, streamGeminiResponse } from "@/lib/gemini-stream"
import type { KVStore } from "@/types"

export const runtime = "edge"

const DEFAULT_MODEL = "gemini-2.5-flash"
const MAX_BODY_BYTES = 1_000_000 // 1 MB

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ────────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // ── 2. Request size guard ──────────────────────────────────────────────────
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ success: false, error: "Payload too large (max 1 MB)" }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 3. Rate limit ─────────────────────────────────────────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. Parse & validate body ──────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const parsed = chatSchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const { messages, personality } = parsed.data

  // ── 5. Fetch structured memories & select relevant facts ──────────────────
  const kv = getKV()
  let memories = ""
  if (kv) {
    const store = await getUserMemoryStore(kv, userId)
    const lastUserMessage = messages.filter((m) => m.role === "user").pop()
    const currentMessage = lastUserMessage?.content ?? ""
    const relevantFacts = getRelevantFacts(store, currentMessage)
    memories = formatFactsForPrompt(relevantFacts)
  }

  // ── 6. Build Gemini request & stream natively ─────────────────────────────
  try {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "GEMINI_API_KEY is not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL
    const requestBody = buildGeminiRequest(messages, personality, memories, model)
    const textStream = await streamGeminiResponse(apiKey, model, requestBody)

    // Transform text deltas into SSE events for the client
    const encoder = new TextEncoder()
    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = textStream.getReader()
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"))
              controller.close()
              return
            }
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ text: value })}\n\n`)
            )
          }
        } catch {
          try {
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            controller.close()
          } catch {
            // controller already closed
          }
        }
      },
    })

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    })
  } catch (err) {
    console.error("Chat route error:", err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
