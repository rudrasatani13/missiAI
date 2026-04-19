// ─── Gemini Live — Server-Side WebSocket Relay ───────────────────────────────
//
// CRITICAL C1 fix (pre-launch audit). The previous implementation handed the
// browser a wss://…-aiplatform.googleapis.com URL with a raw Google Cloud
// `cloud-platform`-scoped OAuth access token baked into the query string.
// Any authenticated user could exfiltrate that token and call *any* Vertex /
// GCP API until the token expired (~1 hour). This relay keeps the real GCP
// token inside the Cloudflare Worker and only exposes an HMAC-signed ticket
// to the browser.
//
// Flow:
//   Client → WS wss://missi.space/api/v1/live-ws?ticket=<TICKET>
//          ← { middleware enforces Clerk session, rate limit, security hdrs }
//   Relay  → validates ticket (signature, expiry, userId == Clerk userId)
//   Relay  → fetch(upstream, { headers: { Upgrade: 'websocket', Authorization } })
//   Relay  ⇄ pipes every frame in both directions
//
// Cloudflare Workers native pattern: new WebSocketPair(); return Response with
// `webSocket` extension field. OpenNext 1.x forwards this unchanged.
//
// NOTE for deploy: if a future OpenNext release strips the `webSocket` extension
// from Next.js route Responses, move this handler to a standalone Cloudflare
// Worker (routed via wrangler.toml) that bypasses the OpenNext wrapper. The
// ticket + upstream URL contract stays the same.

import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { verifyLiveTicket } from "@/lib/ai/live-ticket"
import { getVertexAccessToken, getVertexLocation, isVertexAI } from "@/lib/ai/vertex-auth"
import { getEnv } from "@/lib/server/env"
import { log, logSecurityEvent } from "@/lib/server/logger"

// ── Cloudflare runtime types (not part of @types/node) ───────────────────────
interface CfWebSocketLike {
  accept(): void
  send(data: string | ArrayBuffer): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: "message" | "close" | "error",
    handler: (ev: { data?: string | ArrayBuffer; code?: number; reason?: string }) => void,
  ): void
}

interface CfWebSocketPair {
  0: CfWebSocketLike
  1: CfWebSocketLike
}

declare global {
  // eslint-disable-next-line no-var
  var WebSocketPair: { new (): CfWebSocketPair }
}

// ── Helper: build a plain-HTTP response for non-upgrade requests ─────────────
function jsonError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, code }),
    { status, headers: { "Content-Type": "application/json" } },
  )
}

export async function GET(req: Request): Promise<Response> {
  // 1. Must be a WebSocket upgrade request. Anything else gets a 426.
  const upgradeHeader = req.headers.get("upgrade")?.toLowerCase()
  if (upgradeHeader !== "websocket") {
    return jsonError(426, "UPGRADE_REQUIRED", "Expected WebSocket upgrade")
  }

  // 2. Clerk auth (defense-in-depth — ticket auth is below).
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) {
      return jsonError(401, "UNAUTHORIZED", "Unauthorized")
    }
    return jsonError(500, "INTERNAL_ERROR", "Auth error")
  }

  // 3. Validate ticket.
  const url = new URL(req.url)
  const ticket = url.searchParams.get("ticket") ?? ""
  if (!ticket) {
    return jsonError(400, "MISSING_TICKET", "Missing live ticket")
  }

  let env: ReturnType<typeof getEnv>
  try {
    env = getEnv()
  } catch {
    return jsonError(500, "INTERNAL_ERROR", "Server misconfigured")
  }

  const verified = await verifyLiveTicket(env, ticket)
  if (!verified.valid) {
    logSecurityEvent("security.live_ws.invalid_ticket", {
      userId,
      path: "/api/v1/live-ws",
      metadata: { reason: verified.reason },
    })
    return jsonError(403, "INVALID_TICKET", "Invalid or expired ticket")
  }

  // Bind the ticket to the authenticated Clerk userId.
  if (verified.payload.userId !== userId) {
    logSecurityEvent("security.live_ws.ticket_userid_mismatch", {
      userId,
      path: "/api/v1/live-ws",
    })
    return jsonError(403, "TICKET_USER_MISMATCH", "Ticket does not belong to this session")
  }

  // 4. Build the upstream Vertex WS URL with the REAL GCP token. This URL
  // never leaves the worker — it is only used for the fetch() upgrade below.
  if (!isVertexAI()) {
    return jsonError(500, "NOT_CONFIGURED", "Vertex AI backend not configured")
  }
  const gcpToken = await getVertexAccessToken()
  if (!gcpToken) {
    return jsonError(503, "UPSTREAM_AUTH_FAILED", "Unable to obtain upstream credentials")
  }
  const location = getVertexLocation()
  const upstreamUrl = `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=${gcpToken}`

  // 5. Open upstream WebSocket via Cloudflare's fetch-with-Upgrade pattern.
  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl, {
      headers: { Upgrade: "websocket" },
    })
  } catch (err) {
    log({
      level: "error",
      event: "live_ws.upstream_fetch_failed",
      userId,
      metadata: { error: err instanceof Error ? err.message : String(err) },
      timestamp: Date.now(),
    })
    return jsonError(502, "UPSTREAM_UNREACHABLE", "Upstream unavailable")
  }

  const upstreamWs = (upstreamRes as unknown as { webSocket?: CfWebSocketLike }).webSocket
  if (!upstreamWs) {
    log({
      level: "error",
      event: "live_ws.upstream_no_websocket",
      userId,
      metadata: { status: upstreamRes.status },
      timestamp: Date.now(),
    })
    return jsonError(502, "UPSTREAM_NO_WEBSOCKET", "Upstream did not upgrade to WebSocket")
  }
  upstreamWs.accept()

  // 6. Create the client-side WebSocketPair and wire bidirectional relay.
  const pair = new WebSocketPair()
  const clientSocket: CfWebSocketLike = pair[0]
  const serverSocket: CfWebSocketLike = pair[1]
  serverSocket.accept()

  // Flag tracks which side initiated close so we only close the other once.
  let closed = false
  const closeBoth = (code?: number, reason?: string) => {
    if (closed) return
    closed = true
    try { serverSocket.close(code ?? 1000, reason ?? "relay_closed") } catch {}
    try { upstreamWs.close(code ?? 1000, reason ?? "relay_closed") } catch {}
  }

  // Client → Upstream
  serverSocket.addEventListener("message", (ev) => {
    if (closed || ev.data === undefined) return
    try {
      upstreamWs.send(ev.data)
    } catch {
      closeBoth(1011, "upstream_send_failed")
    }
  })
  serverSocket.addEventListener("close", (ev) => closeBoth(ev.code, ev.reason))
  serverSocket.addEventListener("error", () => closeBoth(1011, "client_error"))

  // Upstream → Client
  upstreamWs.addEventListener("message", (ev) => {
    if (closed || ev.data === undefined) return
    try {
      serverSocket.send(ev.data)
    } catch {
      closeBoth(1011, "client_send_failed")
    }
  })
  upstreamWs.addEventListener("close", (ev) => closeBoth(ev.code, ev.reason))
  upstreamWs.addEventListener("error", () => closeBoth(1011, "upstream_error"))

  log({
    level: "info",
    event: "live_ws.relay_established",
    userId,
    metadata: { modelPath: verified.payload.modelPath },
    timestamp: Date.now(),
  })

  // 7. Return the client end of the pair. Status 101 is set by the runtime.
  return new Response(null, {
    status: 101,
    webSocket: clientSocket,
  } as ResponseInit & { webSocket: CfWebSocketLike })
}
