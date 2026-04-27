/**
 * Structured error codes for chat paths.
 *
 * These replace generic 500s with actionable, queryable error identifiers
 * for alerting and debugging.
 */

export type ChatErrorCode =
  | "CHAT_CONTEXT_TIMEOUT"
  | "CHAT_PROVIDER_UNAVAILABLE"
  | "CHAT_STREAM_INTERRUPTED"
  | "CHAT_TOOL_LOOP_TIMEOUT"
  | "CHAT_AUTH_ERROR"
  | "INTERNAL_ERROR"

export interface ChatError {
  code: ChatErrorCode
  message: string
  status: number
}

export function classifyChatError(err: unknown): ChatError {
  if (
    err instanceof Error &&
    "code" in err &&
    typeof (err as Record<string, unknown>).code === "string" &&
    (err as Record<string, unknown>).code !== ""
  ) {
    const code = (err as Record<string, unknown>).code as ChatErrorCode
    const status = (err as Record<string, unknown>).status as number ?? 500
    return { code, message: err.message, status }
  }

  if (!(err instanceof Error)) {
    return { code: "INTERNAL_ERROR", message: String(err), status: 500 }
  }

  const msg = err.message.toLowerCase()

  // Provider failures — detect 503/429/timeout from provider-router
  if (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("unavailable") ||
    msg.includes("overloaded")
  ) {
    return { code: "CHAT_PROVIDER_UNAVAILABLE", message: err.message, status: 503 }
  }

  // Aborted / disconnected
  if (
    msg.includes("aborted") ||
    msg.includes("cancel") ||
    msg.includes("disconnect")
  ) {
    return { code: "CHAT_STREAM_INTERRUPTED", message: err.message, status: 499 }
  }

  // Timeout on context fetches
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return { code: "CHAT_CONTEXT_TIMEOUT", message: err.message, status: 504 }
  }

  return { code: "INTERNAL_ERROR", message: err.message, status: 500 }
}

export function createChatError(
  code: ChatErrorCode,
  message: string,
  status: number,
): Error & ChatError {
  const error = new Error(message) as Error & ChatError
  error.code = code
  error.status = status
  return error
}
