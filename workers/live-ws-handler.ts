// ─── Gemini Live — Raw Cloudflare Worker WebSocket Relay ─────────────────────
//
// C1 pre-launch audit fix, take 2. The previous attempt put this handler at
// `app/api/v1/live-ws/route.ts` and relied on OpenNext to propagate the
// `webSocket` extension on the Response. It does not. `@opennextjs/cloudflare`
// 1.x converts Next.js route responses through a pipeline that strips any
// Cloudflare-specific fields, so the browser never sees a real 101 upgrade
// and closes with code 1006.
//
// Fix: run this single route OUTSIDE OpenNext, on the raw Cloudflare runtime,
// via the wrapper entrypoint in `workers/entry.ts`. Everything else still
// flows through OpenNext → Next.js unchanged.
//
// Auth model:
//   - The client fetches POST /api/v1/live-token (a normal Next.js route,
//     which DOES run through OpenNext and therefore runs Clerk middleware).
//     That endpoint verifies the Clerk session + plan + voice quota, then
//     mints a short-lived HMAC-signed ticket bound to the userId.
//   - The browser opens wss://<origin>/api/v1/live-ws?ticket=<TICKET>. The
//     ticket itself is the auth token here — 5 min TTL, HMAC-signed, bound
//     to a single userId and modelPath. Stealing a ticket is equivalent to
//     stealing the Clerk cookie, but limited to 5 min and the Live API only.
//   - The real Google Cloud OAuth token never leaves this worker.

import { verifyLiveTicket } from "@/lib/ai/live-ticket"
import { getVertexAccessToken, getVertexLocation, isVertexAI } from "@/lib/ai/vertex-auth"
import { getEnv } from "@/lib/server/env"

// ── Cloudflare-runtime WebSocket shape (not in @types/node) ──────────────────
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

declare const WebSocketPair: { new (): CfWebSocketPair }

// Minimal ExecutionContext — we don't call anything on it here, but the
// wrapper entrypoint passes one through to match the Worker fetch signature.
// We intentionally avoid adding `@cloudflare/workers-types` just for this.
type CfExecutionContext = {
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function jsonError(status: number, code: string, message: string): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, code }),
    { status, headers: { "Content-Type": "application/json" } },
  )
}

// The signature intentionally matches the Cloudflare Worker fetch handler so
// the wrapper in `workers/entry.ts` can delegate without any adaptation.
export async function handleLiveWs(
  req: Request,
  _env: unknown,
  _ctx: CfExecutionContext,
): Promise<Response> {
  // 1. Require a WebSocket upgrade request; anything else gets 426.
  const upgradeHeader = req.headers.get("upgrade")?.toLowerCase()
  if (upgradeHeader !== "websocket") {
    return jsonError(426, "UPGRADE_REQUIRED", "Expected WebSocket upgrade")
  }

  // 2. Extract + validate ticket.
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
    return jsonError(403, "INVALID_TICKET", "Invalid or expired ticket")
  }
  const { userId, modelPath } = verified.payload

  // 3. Build upstream Vertex WS URL with the REAL GCP token. Never sent to
  //    the client — only used for the fetch() upgrade below.
  if (!isVertexAI()) {
    return jsonError(500, "NOT_CONFIGURED", "Vertex AI backend not configured")
  }
  const gcpToken = await getVertexAccessToken()
  if (!gcpToken) {
    return jsonError(503, "UPSTREAM_AUTH_FAILED", "Unable to obtain upstream credentials")
  }
  const location = getVertexLocation()
  // Cloudflare Workers fetch() does NOT accept wss:// URLs — use https:// with
  // Upgrade: websocket header and CF upgrades the connection automatically.
  // Gemini Live is in v1beta1 (VERTEX_AI_API_DEFAULT_VERSION in the SDK).
  const upstreamUrl =
    `https://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`

  // 4. Open upstream WebSocket via Cloudflare's fetch-with-Upgrade pattern.
  // Auth must be in the Authorization header — the access_token query param is
  // not accepted by the BidiGenerateContent WebSocket endpoint.
  let upstreamRes: Response
  try {
    upstreamRes = await fetch(upstreamUrl, {
      headers: {
        Upgrade: "websocket",
        Authorization: `Bearer ${gcpToken}`,
      },
    })
  } catch (err) {
    console.error("[live-ws] upstream fetch failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    })
    return jsonError(502, "UPSTREAM_UNREACHABLE", "Upstream unavailable")
  }

  const upstreamWs = (upstreamRes as unknown as { webSocket?: CfWebSocketLike }).webSocket
  if (!upstreamWs) {
    console.error("[live-ws] upstream did not upgrade", {
      userId,
      status: upstreamRes.status,
    })
    return jsonError(502, "UPSTREAM_NO_WEBSOCKET", "Upstream did not upgrade to WebSocket")
  }
  console.log("[live-ws] upstream upgraded OK", { userId, upstreamStatus: upstreamRes.status })
  upstreamWs.accept()

  // 5. Create the client-facing pair and wire bidirectional relay.
  const pair = new WebSocketPair()
  const clientSocket: CfWebSocketLike = pair[0]
  const serverSocket: CfWebSocketLike = pair[1]
  serverSocket.accept()

  let closed = false
  const closeBoth = (code?: number, reason?: string) => {
    if (closed) return
    closed = true
    console.log("[live-ws] closing both sockets", { userId, code, reason })
    try { serverSocket.close(code ?? 1000, reason ?? "relay_closed") } catch {}
    try { upstreamWs.close(code ?? 1000, reason ?? "relay_closed") } catch {}
  }

  // Client → Upstream
  serverSocket.addEventListener("message", (ev) => {
    if (closed || ev.data === undefined) return
    console.log("[live-ws] client→upstream msg", { userId, len: typeof ev.data === "string" ? ev.data.length : (ev.data as ArrayBuffer).byteLength })
    try {
      upstreamWs.send(ev.data)
    } catch (e) {
      console.error("[live-ws] upstream send failed", { userId, error: String(e) })
      closeBoth(1011, "upstream_send_failed")
    }
  })
  serverSocket.addEventListener("close", (ev) => {
    console.log("[live-ws] client closed", { userId, code: ev.code, reason: ev.reason })
    closeBoth(ev.code, ev.reason)
  })
  serverSocket.addEventListener("error", (ev) => {
    console.error("[live-ws] client socket error", { userId })
    closeBoth(1011, "client_error")
  })

  // Upstream → Client
  upstreamWs.addEventListener("message", (ev) => {
    if (closed || ev.data === undefined) return
    try {
      serverSocket.send(ev.data)
    } catch (e) {
      console.error("[live-ws] client send failed", { userId, error: String(e) })
      closeBoth(1011, "client_send_failed")
    }
  })
  upstreamWs.addEventListener("close", (ev) => {
    console.log("[live-ws] upstream closed", { userId, code: ev.code, reason: ev.reason })
    closeBoth(ev.code, ev.reason)
  })
  upstreamWs.addEventListener("error", () => {
    console.error("[live-ws] upstream socket error", { userId })
    closeBoth(1011, "upstream_error")
  })

  console.log("[live-ws] relay established", { userId, modelPath })

  // 6. Return the client end. Status 101 is set by the runtime on webSocket.
  return new Response(null, {
    status: 101,
    webSocket: clientSocket,
  } as ResponseInit & { webSocket: CfWebSocketLike })
}
