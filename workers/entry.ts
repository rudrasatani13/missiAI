// ─── Custom Cloudflare Worker Entrypoint ─────────────────────────────────────
//
// Wraps the OpenNext-generated worker so we can handle `/api/v1/live-ws`
// OUTSIDE Next.js. The OpenNext pipeline strips the `webSocket` extension
// field from route Responses, which makes native Cloudflare WebSocket
// upgrades impossible from Next.js API route handlers (confirmed against
// @opennextjs/cloudflare@1.19.1: zero references to `webSocket` or
// `WebSocketPair` in the built worker).
//
// Everything else — pages, Server Actions, API routes, middleware, Clerk —
// still flows through the OpenNext worker unchanged.
//
// Build / deploy flow:
//   1. `opennextjs-cloudflare build`  → generates `.open-next/worker.js`.
//   2. `wrangler deploy` (invoked by `opennextjs-cloudflare deploy`) bundles
//      this file via esbuild, inlines the OpenNext worker, and uploads.
//
// We re-export OpenNext's Durable Object classes so they remain wired up if
// any `[[durable_objects.bindings]]` are added to wrangler.toml later. They
// are required exports when OpenNext enables its queue / sharded-tag-cache
// features.

// Resolved at build time by wrangler/esbuild; the file is produced by
// `opennextjs-cloudflare build` before deploy. On a fresh clone with no
// prior build this import will 404 until `pnpm build:cf` runs — that is
// expected and matches how OpenNext's own examples bootstrap.
import openNextWorker, {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DOQueueHandler,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DOShardedTagCache,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  BucketCachePurge,
} from "../.open-next/worker.js"

import { handleLiveWs } from "./live-ws-handler"
import { getVertexAccessToken, getVertexLocation, getVertexProjectId, isVertexAI } from "@/lib/ai/vertex-auth"

// Preserve the Durable Object class exports expected by Cloudflare's runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge }

// Cloudflare Worker fetch signature.
interface CfExecutionContext {
  waitUntil: (promise: Promise<unknown>) => void
  passThroughOnException: () => void
}

export default {
  async fetch(
    request: Request,
    env: unknown,
    ctx: CfExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url)

    // Intercept the Live API WebSocket relay BEFORE OpenNext sees it.
    // OpenNext cannot pass the `webSocket` extension through; the raw
    // Cloudflare runtime can. All other requests fall through untouched.
    if (url.pathname === "/api/v1/voice-relay") {
      return handleLiveWs(request, env, ctx)
    }

    // Temporary diagnostic — remove after debugging
    if (url.pathname === "/api/v1/live-diag") {
      try {
        const token = await getVertexAccessToken()
        const location = getVertexLocation()
        const project = getVertexProjectId()
        const wsUrl = `https://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`
        let wsStatus = "not_tested"
        if (token) {
          try {
            const r = await fetch(wsUrl, { headers: { Upgrade: "websocket", Authorization: `Bearer ${token}` } })
            const ws = (r as any).webSocket
            wsStatus = ws ? "upgraded_ok" : `no_websocket_status_${r.status}`
            if (ws) ws.close(1000, "diag")
          } catch (e) {
            wsStatus = `fetch_error: ${String(e)}`
          }
        }
        return new Response(JSON.stringify({
          isVertex: isVertexAI(),
          hasToken: !!token,
          project,
          location,
          wsUrl,
          wsStatus,
        }), { headers: { "Content-Type": "application/json" } })
      } catch (e) {
        return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } })
      }
    }

    return openNextWorker.fetch(request, env, ctx)
  },
}
