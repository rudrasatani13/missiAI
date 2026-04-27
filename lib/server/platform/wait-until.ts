// ─── Cloudflare waitUntil helper ──────────────────────────────────────────────
//
// H1 fix: background work (analytics, cache writes, XP awards, budget alerts,
// memory extraction) used to be fired as naked `.catch(() => {})` promises.
// On Cloudflare Workers the isolate is eligible for termination the moment the
// response stream finishes, so any of those promises that hadn't resolved yet
// got killed mid-flight. Result: missing analytics events, uncredited XP,
// unwritten rate-limit counters (→ visual-memory quota bypass), stale caches.
//
// This helper registers the promise with `ctx.waitUntil` when the Cloudflare
// execution context is available, so the worker stays alive until it settles.
// When no Cloudflare context is present (local Node.js dev, unit tests) we
// fall back to void-ing the promise with an attached `.catch` so the process
// doesn't crash on an unhandled rejection.

import { getCloudflareExecutionContext } from "@/lib/server/platform/bindings"

type BackgroundPromise = Promise<unknown>

function getCtx(): { waitUntil: (p: BackgroundPromise) => void } | null {
  return getCloudflareExecutionContext()
}

/**
 * Keep the Cloudflare worker alive until `promise` settles.
 *
 * Usage:
 *   waitUntil(recordEvent(kv, { type: "chat", userId }).catch(() => {}))
 *
 * Always attach a `.catch()` before passing to `waitUntil` so a rejection
 * never escapes — `ctx.waitUntil` in some runtimes will surface unhandled
 * rejections as isolate errors.
 */
export function waitUntil(promise: BackgroundPromise): void {
  const ctx = getCtx()
  if (ctx?.waitUntil) {
    try {
      ctx.waitUntil(promise)
      return
    } catch {
      // Fall through to void — some dev contexts throw when waitUntil is
      // called after the response has already been returned.
    }
  }
  // Local dev / test fallback: swallow rejections and drop the reference.
  void promise.catch(() => {})
}

/**
 * Convenience wrapper for sites that want to express "run this async function
 * as background work" without having to manually chain `.catch()`.
 */
export function runInBackground(fn: () => BackgroundPromise): void {
  try {
    waitUntil(fn().catch(() => {}))
  } catch {
    // Never let background work crash the caller
  }
}
