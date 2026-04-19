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
    if (url.pathname === "/api/v1/live-ws") {
      return handleLiveWs(request, env, ctx)
    }

    return openNextWorker.fetch(request, env, ctx)
  },
}
