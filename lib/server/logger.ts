// Server-only utilities for logging

// ─── Structured Logger (Edge-runtime compatible) ─────────────────────────────
//
// In development: pretty-printed JSON to console.
// In production: single-line JSON — Cloudflare Workers Logs captures console.log
// automatically, so no external transport is needed.
//
// Log event classes:
//   auth.*          — authentication and session events (login, logout, 401, forbidden)
//   api.*           — general API request lifecycle (request, rate_limited, error)
//   security.*      — unusual traffic patterns (bot UA, repeated violations, replay attacks)
//   billing.*       — subscription and payment events
//   chat.*          — AI chat events
//   tts.*           — text-to-speech events
//   stt.*           — speech-to-text events
//   proactive.*     — proactive briefing and nudge events
//   middleware.*    — edge middleware events

export interface LogEvent {
  level: "debug" | "info" | "warn" | "error"
  event: string
  userId?: string
  durationMs?: number
  /** Client IP address — populated from cf-connecting-ip / x-forwarded-for */
  ip?: string
  /** Sanitized User-Agent string (first 200 chars) */
  userAgent?: string
  /** HTTP status code sent to the client */
  httpStatus?: number
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
  const logMethod = console[event.level] || console.log

  if (isDev) {
    logMethod(JSON.stringify(event, null, 2))
  } else {
    logMethod(JSON.stringify(event))
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
 * Log an authentication event (success or failure).
 *
 * Call for: sign-in, sign-out, 401 responses, admin access checks, and
 * failed auth attempts. These events populate the "auth.*" event class and
 * make auth flows queryable as a distinct group in Cloudflare Workers Logs.
 */
export function logAuthEvent(
  event: string,
  opts: {
    userId?: string
    ip?: string
    userAgent?: string
    path?: string
    outcome: "success" | "failure" | "forbidden"
    reason?: string
  },
): void {
  log({
    level: opts.outcome === "success" ? "info" : "warn",
    event,
    userId: opts.userId,
    ip: opts.ip,
    userAgent: opts.userAgent ? opts.userAgent.slice(0, 200) : undefined,
    metadata: {
      path: opts.path,
      outcome: opts.outcome,
      ...(opts.reason ? { reason: opts.reason } : {}),
    },
    timestamp: Date.now(),
  })
}

/**
 * Log an API error response sent to the client.
 *
 * Call instead of bare logError() whenever you also know the HTTP status code.
 * This lets you filter all 5xx responses as a single query in Cloudflare Logs.
 */
export function logApiError(
  event: string,
  error: unknown,
  opts: {
    userId?: string
    httpStatus: number
    path?: string
    ip?: string
  },
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
    level: opts.httpStatus >= 500 ? "error" : "warn",
    event,
    userId: opts.userId,
    httpStatus: opts.httpStatus,
    ip: opts.ip,
    metadata: {
      ...(opts.path ? { path: opts.path } : {}),
      // Never include a full stack trace — only the sanitized message
      error: message,
    },
    timestamp: Date.now(),
  })
}

/**
 * Log a security-relevant traffic anomaly without blocking the request.
 *
 * Call for: bot User-Agent detection, rate-limit escalation (repeated
 * violations), webhook replay attempts, and any other unusual patterns that
 * should be surfaced for review without necessarily returning an error.
 */
export function logSecurityEvent(
  event: string,
  opts: {
    ip?: string
    userAgent?: string
    userId?: string
    path?: string
    metadata?: Record<string, unknown>
  },
): void {
  log({
    level: "warn",
    event,
    userId: opts.userId,
    ip: opts.ip,
    userAgent: opts.userAgent ? opts.userAgent.slice(0, 200) : undefined,
    metadata: {
      ...(opts.path ? { path: opts.path } : {}),
      ...opts.metadata,
    },
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
