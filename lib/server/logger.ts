// Server-only utilities for logging

// ─── Structured Logger (Edge-runtime compatible) ─────────────────────────────
//
// In development: pretty-printed JSON to console.
// In production: single-line JSON — Cloudflare Workers Logs captures console.log
// automatically, so no external transport is needed.

export interface LogEvent {
  level: "info" | "warn" | "error"
  event: string
  userId?: string
  durationMs?: number
  metadata?: Record<string, unknown>
  timestamp: number
}

const isDev =
  typeof process !== "undefined" &&
  process.env?.NODE_ENV === "development"

/**
 * Emit a structured log event.
 */
export function log(event: LogEvent): void {
  if (isDev) {
    console.log(JSON.stringify(event, null, 2))
  } else {
    console.log(JSON.stringify(event))
  }
}

/**
 * Log a successful request with computed duration.
 */
export function logRequest(
  event: string,
  userId: string,
  startTime: number,
  metadata?: object,
): void {
  const durationMs = Date.now() - startTime
  log({
    level: "info",
    event,
    userId,
    durationMs,
    metadata: metadata as Record<string, unknown> | undefined,
    timestamp: Date.now(),
  })
}

/**
 * Log an error, safely extracting the message from unknown throw values.
 */
export function logError(
  event: string,
  error: unknown,
  userId?: string,
): void {
  let message: string
  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === "string") {
    message = error
  } else {
    message = String(error)
  }

  log({
    level: "error",
    event,
    userId,
    metadata: { error: message },
    timestamp: Date.now(),
  })
}

/**
 * Create a timer that returns milliseconds elapsed since creation.
 *
 * Usage:
 *   const elapsed = createTimer()
 *   // … do work …
 *   const ms = elapsed() // e.g. 142
 */
export function createTimer(): () => number {
  const start = Date.now()
  return () => Date.now() - start
}
