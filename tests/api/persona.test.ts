import { describe, it, expect, vi, beforeEach } from "vitest"
import type { KVStore } from "@/types"

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock Clerk auth
const mockAuth = vi.fn()
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => mockAuth(),
}))

// Mock @opennextjs/cloudflare
const mockKVStore = new Map<string, string>()
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(() => ({
    env: {
      MISSI_MEMORY: {
        get: async (key: string) => mockKVStore.get(key) ?? null,
        put: async (key: string, value: string) => { mockKVStore.set(key, value) },
        delete: async (key: string) => { mockKVStore.delete(key) },
      } as KVStore,
    },
  })),
}))

// Mock logger — suppress log output in tests
vi.mock("@/lib/server/logger", () => ({
  createTimer: () => () => 0,
  logRequest: vi.fn(),
  logError: vi.fn(),
  logApiError: vi.fn(),
}))

import { GET, POST } from "@/app/api/v1/persona/route"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/v1/persona", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/v1/persona", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockKVStore.clear()
  })

  it("returns 401 with no Clerk session", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const res = await GET()
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.success).toBe(false)
  })

  it("returns current persona for authenticated user", async () => {
    mockAuth.mockResolvedValue({ userId: "user-get-1" })
    mockKVStore.set("persona:preference:user-get-1", "coach")

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personaId).toBe("coach")
    expect(body.displayName).toBe("Energetic Coach")
  })

  it("returns 'default' as default when no preference stored", async () => {
    mockAuth.mockResolvedValue({ userId: "user-get-new" })
    // No KV entry set

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.personaId).toBe("default")
    expect(body.displayName).toBe("Missi")
  })
})

describe("POST /api/v1/persona", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockKVStore.clear()
  })

  it("returns 401 with no Clerk session", async () => {
    mockAuth.mockResolvedValue({ userId: null })
    const req = makeRequest({ personaId: "calm" }) as any
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it("returns 400 when personaId is not in allowlist - 'hacker'", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-bad" })
    const req = makeRequest({ personaId: "hacker" }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when personaId is empty string", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-empty" })
    const req = makeRequest({ personaId: "" }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when personaId is null", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-null" })
    const req = makeRequest({ personaId: null }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 when personaId is undefined (missing key)", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-undef" })
    const req = makeRequest({}) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 for SQL injection attempt", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-sql" })
    const req = makeRequest({ personaId: "'; DROP TABLE users;" }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("returns 400 for very long string", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-long" })
    const req = makeRequest({ personaId: "a".repeat(10000) }) as any
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it("saves valid persona and returns correct displayName", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-ok" })
    const req = makeRequest({ personaId: "bollywood" }) as any
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.personaId).toBe("bollywood")
    expect(body.displayName).toBe("Bollywood Narrator")

    // Verify KV was written
    expect(mockKVStore.get("persona:preference:user-post-ok")).toBe("bollywood")
  })

  it("returns 429 when rate limit exceeded (10 calls)", async () => {
    const userId = "user-post-rate"
    mockAuth.mockResolvedValue({ userId })

    // Simulate 10 prior persona saves by setting the rate limit counter
    const hour = new Date().toISOString().slice(0, 13)
    mockKVStore.set(`ratelimit:persona-save:${userId}:${hour}`, "10")

    const req = makeRequest({ personaId: "friend" }) as any
    const res = await POST(req)
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain("Too many persona changes")
  })

  it("never exposes voice_id in the response body", async () => {
    mockAuth.mockResolvedValue({ userId: "user-post-no-voice" })
    const req = makeRequest({ personaId: "desi-mom" }) as any
    const res = await POST(req)
    const body = await res.json()

    // Check that no voice-related field is in the response
    expect(body.voiceId).toBeUndefined()
    expect(body.voice_id).toBeUndefined()
    expect(body.voiceEnvKey).toBeUndefined()

    // Stringify and check for voice patterns
    const bodyStr = JSON.stringify(body)
    expect(bodyStr).not.toContain("ELEVENLABS_VOICE")
    expect(bodyStr).not.toContain("voiceEnvKey")
  })
})
