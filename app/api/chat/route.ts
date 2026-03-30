import { NextRequest } from "next/server"
import { auth } from "@clerk/nextjs/server"
import { generateResponse } from "@/services/ai.service"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { chatSchema, validationErrorResponse } from "@/lib/validation"
import { z } from "zod"

export const runtime = "edge"

const MAX_BODY_BYTES = 1_000_000 // 1 MB

export async function POST(req: NextRequest) {
  // ── 1. Auth: userId comes from Clerk session — never trust the client ─────
  const { userId } = await auth()
  if (!userId) {
    return new Response(
      JSON.stringify({ success: false, error: "Unauthorized" }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 2. Request size guard ─────────────────────────────────────────────────
  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ success: false, error: "Payload too large (max 1 MB)" }),
      { status: 413, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 3. Rate limit (per user, free tier = 10 req/min) ─────────────────────
  const rateResult = await checkRateLimit(userId, "free")
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. Parse & validate body with Zod ────────────────────────────────────
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

  const { messages, personality, memories } = parsed.data

  // ── 5. Call AI with timeout (15 s hard cap via AbortController) ───────────
  try {
    const responseText = await generateResponse(messages, personality, memories, {
      timeoutMs: 15_000,
    })

    if (!responseText) {
      return new Response(
        JSON.stringify({ success: false, error: "Empty response from AI" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    // ── 6. Stream SSE back to the client ─────────────────────────────────
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const chunkSize = 100
        for (let i = 0; i < responseText.length; i += chunkSize) {
          const chunk = responseText.slice(i, i + chunkSize)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`)
          )
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    console.error("Chat route error:", err)
    const isTimeout = err instanceof Error && err.name === "AbortError"
    return new Response(
      JSON.stringify({
        success: false,
        error: isTimeout ? "AI request timed out. Please try again." : "Internal server error",
      }),
      { status: isTimeout ? 504 : 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
