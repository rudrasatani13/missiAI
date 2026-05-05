import { NextRequest } from "next/server"
import { rateLimitHeaders } from "@/lib/server/security/rate-limiter"
import { logError } from "@/lib/server/observability/logger"
import { classifyChatError } from "@/lib/server/chat/errors"
import { buildChatStreamContext } from "@/lib/server/chat/stream-context"
import { runChatStreamPreflight } from "@/lib/server/chat/stream-preflight"
import { buildChatStreamSseStream } from "@/lib/server/chat/stream-runner"

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  let requestUserId: string | undefined

  try {
    const preflight = await runChatStreamPreflight(req)
    if (!preflight.ok) {
      return preflight.response
    }

    requestUserId = preflight.data.userId
    const userId = preflight.data.userId
    const { kv, rateResult, input } = preflight.data
    const { voiceMode, customPrompt, incognito, analyticsOptOut } = input

    const {
      messages,
      memories,
      systemPrompt,
      inputTokens,
      model: selectedModel,
      maxOutputTokens,
    } = await buildChatStreamContext({
      userId,
      kv,
      input,
    })

    const sseStream = buildChatStreamSseStream({
      kv,
      userId,
      startTime,
      inputTokens,
      messages,
      voiceMode,
      customPrompt,
      incognito,
      analyticsOptOut,
      memories,
      systemPrompt,
      model: selectedModel,
      maxOutputTokens,
    })

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        ...rateLimitHeaders(rateResult),
      },
    })
  } catch (err) {
    const classified = classifyChatError(err)
    logError("chat_stream.fatal_error", err, requestUserId)
    return new Response(
      JSON.stringify({
        success: false,
        error: classified.message,
        code: classified.code,
      }),
      { status: classified.status, headers: { "Content-Type": "application/json" } }
    )
  }
}
