import { beforeEach, describe, expect, it, vi } from "vitest"

// ─── Mocks ─────────────────────────────────────────────────────────────────────

const { vertexGeminiGenerateStreamMock } = vi.hoisted(() => ({
  vertexGeminiGenerateStreamMock: vi.fn(),
}))

vi.mock("@/lib/ai/providers/vertex-client", () => ({
  vertexGeminiGenerateStream: vertexGeminiGenerateStreamMock,
}))

import { POST } from "@/app/api/v1/guest-chat/route"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEST_SECRET = "test-guest-session-secret-for-vitest"

async function buildSignedCookieValue(count: number, expiresAt: number, secret = TEST_SECRET): Promise<string> {
  const session = { count, expiresAt }
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url")
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  const sigB64 = Buffer.from(sig).toString("base64url")
  return `${payload}.${sigB64}`
}

/** Valid response body that passes the `messages` validation. */
const VALID_BODY = {
  messages: [{ role: "user", content: "Hello" }],
}

/** Minimal streaming response stub that satisfies the route's body parsing. */
function makeStreamResponse() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode('data: {"candidates":[{"content":{"parts":[{"text":"Hi!"}]}}]}\n\n'),
      )
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

function makeRequest(opts?: {
  cookie?: string
  ip?: string
  body?: unknown
}): Request {
  const { cookie, ip = "203.0.113.1", body = VALID_BODY } = opts ?? {}
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "cf-connecting-ip": ip,
  }
  if (cookie) headers["Cookie"] = cookie

  return new Request("https://missi.space/api/v1/guest-chat", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/v1/guest-chat", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GUEST_SESSION_SECRET = TEST_SECRET
    vertexGeminiGenerateStreamMock.mockResolvedValue(makeStreamResponse())
  })

  // ── 1. Cookie tampering is rejected ──────────────────────────────────────

  it("rejects a tampered session cookie and falls back to a fresh session", async () => {
    // Build a valid cookie at the limit (count=5) then corrupt the signature.
    const validValue = await buildSignedCookieValue(5, Date.now() + 86_400_000)
    const dotIndex = validValue.lastIndexOf(".")
    const payload = validValue.slice(0, dotIndex)
    const sig = validValue.slice(dotIndex + 1)
    // Flip the first character of the signature to invalidate the HMAC.
    const corruptedSig = (sig[0] === "A" ? "B" : "A") + sig.slice(1)
    const tamperedCookie = `missi_guest_session=${payload}.${corruptedSig}`

    // count=5 would normally be rejected; with a broken sig it reverts to 0
    const res = await POST(makeRequest({ cookie: tamperedCookie, ip: "10.0.1.1" }))

    // Route should NOT treat this as a maxed-out session
    expect(res.status).not.toBe(429)
    // AI call proves the route treated it as a fresh session (count=0)
    expect(vertexGeminiGenerateStreamMock).toHaveBeenCalledTimes(1)
  })

  it("rejects a payload-modified cookie (count changed, original sig retained)", async () => {
    // Start with a valid cookie for count=0, then change the payload to count=999.
    const validValue = await buildSignedCookieValue(0, Date.now() + 86_400_000)
    const dotIndex = validValue.lastIndexOf(".")
    const originalSig = validValue.slice(dotIndex + 1)

    // Re-encode a different payload (count=999) but keep the original signature.
    const hackedPayload = Buffer.from(JSON.stringify({ count: 999, expiresAt: Date.now() + 86_400_000 })).toString("base64url")
    const hackedCookie = `missi_guest_session=${hackedPayload}.${originalSig}`

    // HMAC verification will fail → treated as fresh session → request allowed
    const res = await POST(makeRequest({ cookie: hackedCookie, ip: "10.0.1.2" }))

    expect(res.status).not.toBe(429)
    expect(vertexGeminiGenerateStreamMock).toHaveBeenCalledTimes(1)
  })

  // ── 2. Guest chat limit cannot be bypassed by forged cookie ───────────────

  it("blocks at GUEST_MAX_MESSAGES (5) even when cookie is valid and at the limit", async () => {
    // Legitimately build a cookie with count=5 (which equals GUEST_MAX_MESSAGES).
    const cookieValue = await buildSignedCookieValue(5, Date.now() + 86_400_000)
    const cookie = `missi_guest_session=${cookieValue}`

    const res = await POST(makeRequest({ cookie, ip: "10.0.2.1" }))

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe("GUEST_LIMIT_REACHED")
    // AI must NOT be called when the session is at the limit
    expect(vertexGeminiGenerateStreamMock).not.toHaveBeenCalled()
  })

  it("cannot forge a count above the limit with a wrong secret to bypass the guard", async () => {
    // Build a cookie with count=999 signed with a DIFFERENT secret.
    const cookieValue = await buildSignedCookieValue(999, Date.now() + 86_400_000, "attacker-secret")
    const cookie = `missi_guest_session=${cookieValue}`

    // Verification will fail (wrong key) → fresh session with count=0 → allowed
    const res = await POST(makeRequest({ cookie, ip: "10.0.2.2" }))

    // Request is processed as a fresh guest, limit is NOT bypassed
    expect(res.status).not.toBe(429)
    expect(vertexGeminiGenerateStreamMock).toHaveBeenCalledTimes(1)
  })

  it("refuses a cookie with a negative count even if signed correctly", async () => {
    // A legitimately signed cookie with count=-1 should be treated as fresh.
    const cookieValue = await buildSignedCookieValue(-1, Date.now() + 86_400_000)
    const cookie = `missi_guest_session=${cookieValue}`

    // parseGuestSession returns null for negative count → fresh session (count=0)
    const res = await POST(makeRequest({ cookie, ip: "10.0.2.3" }))

    expect(res.status).not.toBe(429)
    expect(vertexGeminiGenerateStreamMock).toHaveBeenCalledTimes(1)
  })

  it("refuses an expired session cookie and falls back to a fresh session", async () => {
    // Expired cookie (expiresAt in the past) must be rejected → fresh session
    const expiredAt = Date.now() - 1_000
    const cookieValue = await buildSignedCookieValue(5, expiredAt)
    const cookie = `missi_guest_session=${cookieValue}`

    // count=5 in an expired cookie should not trigger 429
    const res = await POST(makeRequest({ cookie, ip: "10.0.2.4" }))

    expect(res.status).not.toBe(429)
    expect(vertexGeminiGenerateStreamMock).toHaveBeenCalledTimes(1)
  })

  // ── 3. Per-IP rate limit returns 429 ─────────────────────────────────────

  it("returns 429 after IP_MAX_REQUESTS (20) requests within the rate-limit window", async () => {
    // Use a unique IP so previous tests' buckets don't interfere.
    const ip = "10.0.3.99"

    // Make IP_MAX_REQUESTS successful requests to fill the bucket.
    for (let i = 0; i < 20; i++) {
      vertexGeminiGenerateStreamMock.mockResolvedValueOnce(makeStreamResponse())
      // Use a fresh session cookie each time (count < 5)
      const cookieValue = await buildSignedCookieValue(0, Date.now() + 86_400_000)
      await POST(makeRequest({ ip, cookie: `missi_guest_session=${cookieValue}` }))
    }

    // The 21st request must be rate-limited
    const res = await POST(makeRequest({ ip, body: VALID_BODY }))

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.error).toBe("RATE_LIMITED")
    // AI must not be called for the rate-limited request
    expect(vertexGeminiGenerateStreamMock).toHaveBeenCalledTimes(20)
  })

  // ── Edge cases ────────────────────────────────────────────────────────────

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("https://missi.space/api/v1/guest-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "cf-connecting-ip": "10.0.4.1" },
      body: "not-json",
    })

    const res = await POST(req)

    expect(res.status).toBe(400)
    expect(vertexGeminiGenerateStreamMock).not.toHaveBeenCalled()
  })

  it("returns 400 when messages array is empty", async () => {
    const res = await POST(makeRequest({ ip: "10.0.4.2", body: { messages: [] } }))

    expect(res.status).toBe(400)
    expect(vertexGeminiGenerateStreamMock).not.toHaveBeenCalled()
  })

  it("returns 400 when the last message is not from the user", async () => {
    const res = await POST(makeRequest({
      ip: "10.0.4.3",
      body: { messages: [{ role: "assistant", content: "Hi" }] },
    }))

    expect(res.status).toBe(400)
    expect(vertexGeminiGenerateStreamMock).not.toHaveBeenCalled()
  })
})
