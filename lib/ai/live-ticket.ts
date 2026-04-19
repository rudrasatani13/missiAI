// ─── Gemini Live Relay Ticket ─────────────────────────────────────────────────
//
// C1 fix: we used to return the raw Vertex AI WebSocket URL — complete with a
// Google Cloud OAuth access token in the query string — directly to the
// browser. That token was scoped to `cloud-platform`, valid for ~1 hour, and
// could be used against any GCP API until expiry. Critical credential leak.
//
// The relay flow is now:
//   1. Client calls POST /api/v1/live-token (authenticated, voice-time-gated).
//   2. Server issues a short-lived HMAC-signed ticket that binds a userId
//      and the selected model/voice to a ≤5-minute window.
//   3. Client opens wss://<origin>/api/v1/live-ws?ticket=<TICKET>.
//   4. Relay verifies (a) Clerk session, (b) ticket signature, (c) ticket
//      expiry. Only then is the upstream Vertex WebSocket opened server-side
//      and frames are proxied bidirectionally. The real GCP token never
//      leaves the worker isolate.

import type { AppEnv } from "@/lib/server/env"

// 5 minutes — the user must connect the WS promptly after requesting a ticket.
// Short enough that a leaked ticket has negligible value.
const TICKET_TTL_SECONDS = 300

export interface LiveTicketPayload {
  userId: string
  modelPath: string
  voiceId?: string
  expiresAt: number // unix ms
}

// ─── Encoding helpers (Edge / Web Crypto compatible) ──────────────────────────

function base64urlEncode(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/")
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4))
  const binary = atob(padded + pad)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function requireSecret(env: AppEnv): string {
  const secret = env.MISSI_KV_ENCRYPTION_SECRET
  if (!secret || secret.trim().length < 32) {
    throw new Error(
      "MISSI_KV_ENCRYPTION_SECRET is required (≥32 chars) for Live relay tickets",
    )
  }
  return secret
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

// ─── Sign / verify ────────────────────────────────────────────────────────────

/**
 * Issue a ticket the client can present to /api/v1/live-ws.
 * Format: `<base64url(JSON payload)>.<base64url(HMAC-SHA256)>`
 */
export async function issueLiveTicket(
  env: AppEnv,
  opts: { userId: string; modelPath: string; voiceId?: string },
): Promise<string> {
  const secret = requireSecret(env)
  const payload: LiveTicketPayload = {
    userId: opts.userId,
    modelPath: opts.modelPath,
    voiceId: opts.voiceId,
    expiresAt: Date.now() + TICKET_TTL_SECONDS * 1000,
  }

  const payloadJson = JSON.stringify(payload)
  const payloadB64 = base64urlEncode(new TextEncoder().encode(payloadJson))

  const key = await importKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64))
  const sigB64 = base64urlEncode(new Uint8Array(sig))

  return `${payloadB64}.${sigB64}`
}

export type LiveTicketVerifyResult =
  | { valid: true; payload: LiveTicketPayload }
  | { valid: false; reason: "malformed" | "expired" | "signature" }

/**
 * Verify a ticket. Returns the parsed payload iff the HMAC matches and the
 * expiry is in the future.
 */
export async function verifyLiveTicket(
  env: AppEnv,
  ticket: string,
): Promise<LiveTicketVerifyResult> {
  if (typeof ticket !== "string" || ticket.length < 20 || ticket.length > 4096) {
    return { valid: false, reason: "malformed" }
  }
  const parts = ticket.split(".")
  if (parts.length !== 2) return { valid: false, reason: "malformed" }

  const [payloadB64, sigB64] = parts

  let secret: string
  try {
    secret = requireSecret(env)
  } catch {
    return { valid: false, reason: "signature" }
  }

  try {
    const key = await importKey(secret)
    const sigBytes = base64urlDecode(sigB64)
    // Cast to BufferSource — TS 5.x is strict about SharedArrayBuffer vs ArrayBuffer
    // generics on Uint8Array, but Web Crypto accepts either at runtime.
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      sigBytes as unknown as BufferSource,
      new TextEncoder().encode(payloadB64),
    )
    if (!ok) return { valid: false, reason: "signature" }

    const payloadJson = new TextDecoder().decode(base64urlDecode(payloadB64))
    const payload = JSON.parse(payloadJson) as LiveTicketPayload

    if (
      typeof payload.userId !== "string" ||
      typeof payload.modelPath !== "string" ||
      typeof payload.expiresAt !== "number"
    ) {
      return { valid: false, reason: "malformed" }
    }
    if (Date.now() > payload.expiresAt) {
      return { valid: false, reason: "expired" }
    }
    return { valid: true, payload }
  } catch {
    return { valid: false, reason: "malformed" }
  }
}

export const LIVE_TICKET_TTL_SECONDS = TICKET_TTL_SECONDS
