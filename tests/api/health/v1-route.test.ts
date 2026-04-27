import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock @opennextjs/cloudflare before importing the route
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: vi.fn(),
}))

// Mock @/lib/server/observability/logger to avoid side effects
vi.mock("@/lib/server/observability/logger", () => ({
  log: vi.fn(),
}))

import { GET } from "@/app/api/health/route"
import { getCloudflareContext } from "@opennextjs/cloudflare"

const mockGetRequestContext = vi.mocked(getCloudflareContext)

beforeEach(() => {
  vi.clearAllMocks()
  // Ensure env vars are set by default
  process.env.CLERK_SECRET_KEY = "test-clerk-secret"
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "test-google-key"
})

describe("GET /api/health", () => {
  it("returns 200 with status 'ok' when KV is healthy and env vars present", async () => {
    mockGetRequestContext.mockReturnValue({
      env: {
        MISSI_MEMORY: {
          get: async () => null,
          put: async () => {},
        },
      },
      ctx: {} as any,
      cf: {} as any,
    } as any)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe("ok")
    expect(body.checks.kv).toBe("ok")
    expect(body.checks.env).toBe("ok")
  })

  it("returns 207 with status 'degraded' and kv 'error' when KV throws", async () => {
    mockGetRequestContext.mockReturnValue({
      env: {
        MISSI_MEMORY: {
          get: async () => {
            throw new Error("KV unavailable")
          },
          put: async () => {},
        },
      },
      ctx: {} as any,
      cf: {} as any,
    } as any)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(207)
    expect(body.status).toBe("degraded")
    expect(body.checks.kv).toBe("error")
  })

  it("returns 207 with env 'missing' when an env var is absent", async () => {
    mockGetRequestContext.mockReturnValue({
      env: {
        MISSI_MEMORY: {
          get: async () => null,
          put: async () => {},
        },
      },
      ctx: {} as any,
      cf: {} as any,
    } as any)

    // Remove a required env var
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(207)
    expect(body.status).toBe("degraded")
    expect(body.checks.env).toBe("missing")

    // Restore for other tests
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "test-google-key"
  })

  it("returns 503 with status 'down' when both KV and env fail", async () => {
    mockGetRequestContext.mockImplementation(() => {
      throw new Error("No request context")
    })

    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.status).toBe("down")
    expect(body.checks.kv).toBe("error")
    expect(body.checks.env).toBe("missing")

    // Restore
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = "test-google-key"
  })
})
