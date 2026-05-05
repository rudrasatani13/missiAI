import { NextResponse } from "next/server"
import { vertexGeminiGenerateStream } from "@/lib/ai/providers/vertex-client"

const GUEST_MAX_MESSAGES = 5
const GUEST_SESSION_COOKIE = "missi_guest_session"
const GUEST_CHAT_MODEL = "gemini-2.0-flash"
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

// ─── Per-IP in-isolate rate limit ─────────────────────────────────────────────
// Caps raw request volume per IP to limit cost exposure from automation.
// Not globally consistent across Cloudflare isolates, but provides meaningful
// per-instance protection and is the only option without KV for unauthenticated
// requests.
const IP_WINDOW_MS = 60_000
const IP_MAX_REQUESTS = 20

// ─── Guest AI hard budget ──────────────────────────────────────────────────────
// Per-IP daily limit: max AI requests in a 24h window (in-isolate).
// Global isolate limit: absolute ceiling across all IPs before isolate reset.
// These are a secondary cost guardrail; the signed session cookie is the primary
// per-user limit. These caps defend against multi-session abuse and automation.
const GUEST_IP_DAILY_MAX = parseInt(process.env.GUEST_IP_DAILY_MAX ?? "30", 10)
const GUEST_GLOBAL_ISOLATE_MAX = parseInt(process.env.GUEST_GLOBAL_ISOLATE_MAX ?? "500", 10)
const IP_DAILY_WINDOW_MS = 24 * 60 * 60 * 1000

let globalGuestRequestCount = 0
let globalGuestWindowStart = Date.now()

interface IpBucket {
  count: number
  windowStart: number
  dailyCount: number
  dailyWindowStart: number
}
const ipBuckets = new Map<string, IpBucket>()
let lastIpSweep = Date.now()

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now()
  if (now - lastIpSweep > 5 * 60_000) {
    lastIpSweep = now
    for (const [k, b] of ipBuckets) {
      if (now - b.windowStart > IP_WINDOW_MS * 2) ipBuckets.delete(k)
    }
  }
  const bucket = ipBuckets.get(ip)
  if (!bucket || now - bucket.windowStart >= IP_WINDOW_MS) {
    ipBuckets.set(ip, { count: 1, windowStart: now, dailyCount: 1, dailyWindowStart: now })
    return true
  }
  if (bucket.count >= IP_MAX_REQUESTS) return false
  bucket.count++
  return true
}

function checkGuestAiBudget(ip: string): { allowed: boolean; reason?: string } {
  const now = Date.now()

  if (now - globalGuestWindowStart >= IP_DAILY_WINDOW_MS) {
    globalGuestRequestCount = 0
    globalGuestWindowStart = now
  }
  if (globalGuestRequestCount >= GUEST_GLOBAL_ISOLATE_MAX) {
    return { allowed: false, reason: "GLOBAL_GUEST_BUDGET_EXCEEDED" }
  }

  const bucket = ipBuckets.get(ip)
  if (bucket) {
    if (now - bucket.dailyWindowStart >= IP_DAILY_WINDOW_MS) {
      bucket.dailyCount = 0
      bucket.dailyWindowStart = now
    }
    if (bucket.dailyCount >= GUEST_IP_DAILY_MAX) {
      return { allowed: false, reason: "IP_DAILY_GUEST_BUDGET_EXCEEDED" }
    }
    bucket.dailyCount++
  }

  globalGuestRequestCount++
  return { allowed: true }
}

// ─── HMAC-signed session cookie ───────────────────────────────────────────────
// Cookie format: <base64url(payload)>.<base64url(HMAC-SHA256)>
// Payload is base64url-encoded JSON so the HMAC covers the raw bytes.
// Any tampering with count/expiresAt invalidates the signature → reset to 0.

function getGuestSessionSecret(): string | null {
  const secret = process.env.GUEST_SESSION_SECRET
  if (!secret || secret.trim().length === 0) {
    if (process.env.NODE_ENV === "production") {
      console.error("[guest-chat] GUEST_SESSION_SECRET is not set in production — failing closed")
      return null
    }
    return "dev-only-guest-session-secret-not-for-production"
  }
  return secret
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  )
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await importHmacKey(secret)
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  return Buffer.from(sig).toString("base64url")
}

async function verifyPayload(payload: string, sigB64: string, secret: string): Promise<boolean> {
  try {
    const key = await importHmacKey(secret)
    const sig = Buffer.from(sigB64, "base64url")
    return await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(payload))
  } catch {
    return false
  }
}

interface GuestSession {
  count: number
  expiresAt: number
}

async function parseGuestSession(cookieValue: string, secret: string): Promise<GuestSession | null> {
  try {
    const dot = cookieValue.lastIndexOf(".")
    if (dot < 1) return null
    const payloadB64 = cookieValue.slice(0, dot)
    const sigB64 = cookieValue.slice(dot + 1)
    if (!sigB64) return null

    const valid = await verifyPayload(payloadB64, sigB64, secret)
    if (!valid) return null

    const json = Buffer.from(payloadB64, "base64url").toString("utf-8")
    const parsed = JSON.parse(json) as GuestSession
    if (typeof parsed.count !== "number" || typeof parsed.expiresAt !== "number") return null
    if (Date.now() > parsed.expiresAt) return null
    if (parsed.count < 0 || !Number.isInteger(parsed.count)) return null
    return parsed
  } catch {
    return null
  }
}

async function encodeGuestSession(session: GuestSession, secret: string): Promise<string> {
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url")
  const sig = await signPayload(payload, secret)
  return `${payload}.${sig}`
}

async function buildSessionCookieHeader(session: GuestSession, secret: string): Promise<string> {
  const value = await encodeGuestSession(session, secret)
  const expires = new Date(session.expiresAt).toUTCString()
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${GUEST_SESSION_COOKIE}=${value}; Path=/api/v1/guest-chat; HttpOnly${secure}; SameSite=Lax; Expires=${expires}`
}

function getClientIP(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  )
}

const GUEST_SYSTEM_PROMPT = `You are Missi, a warm, intelligent AI assistant with a personality. 
You're helpful, curious, and conversational.
Keep responses concise (2-4 sentences typically) unless the question warrants more depth.
The user is exploring Missi as a guest — no memory or voice yet. 
Be natural and friendly. Don't lecture about limitations unless they ask.`

interface GuestMessage {
  role: "user" | "assistant"
  content: string
}

export async function POST(request: Request): Promise<Response> {
  // ── Per-IP rate limit ──────────────────────────────────────────────────────
  const ip = getClientIP(request)
  if (!checkIpRateLimit(ip)) {
    return NextResponse.json({ error: "RATE_LIMITED" }, { status: 429 })
  }

  // ── Guest AI hard budget ───────────────────────────────────────────────────
  const guestBudget = checkGuestAiBudget(ip)
  if (!guestBudget.allowed) {
    return NextResponse.json(
      { error: "SERVICE_TEMPORARILY_UNAVAILABLE" },
      { status: 503 },
    )
  }

  // ── Secret guard ──────────────────────────────────────────────────────────
  const secret = getGuestSessionSecret()
  if (!secret) {
    return NextResponse.json({ error: "SERVICE_UNAVAILABLE" }, { status: 503 })
  }

  // ── Parse & verify signed session cookie ─────────────────────────────────
  const cookieHeader = request.headers.get("cookie") ?? ""
  const cookieMatch = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${GUEST_SESSION_COOKIE}=([^;]+)`)
  )
  const rawSession = cookieMatch?.[1] ?? null

  const now = Date.now()
  const freshSession: GuestSession = { count: 0, expiresAt: now + SESSION_TTL_MS }

  let session: GuestSession = freshSession
  if (rawSession) {
    const verified = await parseGuestSession(rawSession, secret)
    session = verified ?? freshSession
  }

  if (session.count >= GUEST_MAX_MESSAGES) {
    return NextResponse.json(
      { error: "GUEST_LIMIT_REACHED" },
      { status: 429 }
    )
  }

  // ── Validate request body ─────────────────────────────────────────────────
  let body: { messages?: GuestMessage[] }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 })
  }

  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "INVALID_MESSAGES" }, { status: 400 })
  }

  const lastMessage = messages[messages.length - 1]
  if (!lastMessage || lastMessage.role !== "user" || !lastMessage.content?.trim()) {
    return NextResponse.json({ error: "INVALID_LAST_MESSAGE" }, { status: 400 })
  }

  const contents = messages.slice(-10).map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content).slice(0, 4000) }],
  }))

  const geminiRequest = {
    system_instruction: { parts: [{ text: GUEST_SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.85,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 600,
    },
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const geminiRes = await vertexGeminiGenerateStream(
      GUEST_CHAT_MODEL,
      geminiRequest,
      { signal: controller.signal }
    )

    if (!geminiRes.ok) {
      clearTimeout(timeout)
      const errText = await geminiRes.text().catch(() => "unknown error")
      console.error("[guest-chat] Gemini error:", geminiRes.status, errText)
      return NextResponse.json({ error: "AI_ERROR" }, { status: 502 })
    }

    const updatedSession: GuestSession = { count: session.count + 1, expiresAt: session.expiresAt }
    const newCookie = await buildSessionCookieHeader(updatedSession, secret)
    const remaining = GUEST_MAX_MESSAGES - updatedSession.count

    const sseStream = new ReadableStream({
      async start(streamController: ReadableStreamDefaultController) {
        const encoder = new TextEncoder()

        try {
          if (!geminiRes.body) {
            streamController.enqueue(encoder.encode(`data: [DONE]\n\n`))
            streamController.close()
            return
          }

          const reader = geminiRes.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ""

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })

            const lines = buffer.split("\n")
            buffer = lines.pop() ?? ""

            for (const line of lines) {
              const trimmed = line.trim()
              if (!trimmed || !trimmed.startsWith("data:")) continue
              const dataStr = trimmed.slice(5).trim()
              if (dataStr === "[DONE]") continue

              try {
                const parsed = JSON.parse(dataStr)
                const parts = parsed?.candidates?.[0]?.content?.parts
                if (Array.isArray(parts)) {
                  for (const part of parts) {
                    if (typeof part.text === "string" && part.text) {
                      streamController.enqueue(
                        encoder.encode(`data: ${JSON.stringify({ text: part.text, remaining })}\n\n`)
                      )
                    }
                  }
                }
              } catch {}
            }
          }
        } catch (err) {
          console.error("[guest-chat] Stream read error:", err)
        } finally {
          clearTimeout(timeout)
          streamController.enqueue(new TextEncoder().encode(`data: [DONE]\n\n`))
          streamController.close()
        }
      },
    })

    return new Response(sseStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-store",
        "X-Accel-Buffering": "no",
        "Set-Cookie": newCookie,
        "X-Guest-Messages-Remaining": String(remaining),
      },
    })
  } catch (err) {
    clearTimeout(timeout)
    console.error("[guest-chat] Fatal error:", err)
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 })
}
