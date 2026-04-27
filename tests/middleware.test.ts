import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  authState,
  protectMock,
  logMock,
  logAuthEventMock,
  logSecurityEventMock,
} = vi.hoisted(() => ({
  authState: {
    userId: null as string | null,
    sessionClaims: undefined as unknown,
  },
  protectMock: vi.fn(async () => undefined),
  logMock: vi.fn(),
  logAuthEventMock: vi.fn(),
  logSecurityEventMock: vi.fn(),
}))

vi.mock("@clerk/nextjs/server", () => {
  function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  function createRouteMatcher(patterns: string[]) {
    const regexes = patterns.map((pattern) => {
      const source = pattern.split("(.*)").map(escapeRegex).join(".*")
      return new RegExp(`^${source}$`)
    })

    return (input: string | { nextUrl?: { pathname?: string }; url?: string }) => {
      const pathname = typeof input === "string"
        ? input
        : input?.nextUrl?.pathname ?? (input?.url ? new URL(input.url).pathname : "")

      return regexes.some((regex) => regex.test(pathname))
    }
  }

  return {
    createRouteMatcher,
    clerkMiddleware: (handler: (auth: (() => Promise<typeof authState>) & { protect: typeof protectMock }, request: NextRequest) => Promise<Response | void>) => {
      return async (request: NextRequest) => {
        const auth = Object.assign(
          async () => ({ ...authState }),
          { protect: protectMock },
        )

        return handler(auth, request)
      }
    },
  }
})

vi.mock("@/lib/server/observability/logger", () => ({
  log: logMock,
  logAuthEvent: logAuthEventMock,
  logSecurityEvent: logSecurityEventMock,
}))

function makeRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

async function loadMiddleware() {
  return import("@/middleware")
}

describe("middleware", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    authState.userId = null
    authState.sessionClaims = undefined
    protectMock.mockResolvedValue(undefined)
  })

  it("blocks protected media hotlink requests from cross-site sources", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/videos/demo.mp4", {
        headers: {
          "cf-connecting-ip": "203.0.113.10",
          "sec-fetch-site": "cross-site",
          "user-agent": "Mozilla/5.0",
        },
      }),
      {} as never,
    )

    expect(response.status).toBe(403)
    expect(await response.text()).toBe("Forbidden")
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin")
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin")
    expect(response.headers.get("Vary")).toContain("Origin")
    expect(response.headers.get("Vary")).toContain("Referer")
    expect(response.headers.get("Vary")).toContain("Sec-Fetch-Site")
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      "security.media_hotlink_blocked",
      expect.objectContaining({
        ip: "203.0.113.10",
        path: "/videos/demo.mp4",
      }),
    )
  })

  it("allows protected media requests from same-origin sources", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/images/landing/hero.png", {
        headers: {
          "cf-connecting-ip": "203.0.113.11",
          "sec-fetch-site": "same-origin",
          "user-agent": "Mozilla/5.0",
        },
      }),
      {} as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin")
    expect(response.headers.get("Referrer-Policy")).toBe("same-origin")
    expect(logSecurityEventMock).not.toHaveBeenCalled()
  })

  it("allows protected media requests from an allowed Origin header", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/missi-m.png", {
        headers: {
          origin: "https://missi.space",
          "cf-connecting-ip": "203.0.113.15",
          "user-agent": "Mozilla/5.0",
        },
      }),
      {} as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin")
    expect(logSecurityEventMock).not.toHaveBeenCalled()
  })

  it("allows protected media requests from a same-origin Referer header", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/videos/demo.mp4", {
        headers: {
          referer: "https://missi.space/chat?tab=voice",
          "cf-connecting-ip": "203.0.113.16",
          "user-agent": "Mozilla/5.0",
        },
      }),
      {} as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin")
    expect(logSecurityEventMock).not.toHaveBeenCalled()
  })

  it("blocks protected media requests with malformed Referer headers", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/missi-m.png", {
        headers: {
          referer: "://bad-referer",
          "cf-connecting-ip": "203.0.113.17",
          "user-agent": "Mozilla/5.0",
        },
      }),
      {} as never,
    )

    expect(response.status).toBe(403)
    expect(await response.text()).toBe("Forbidden")
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      "security.media_hotlink_blocked",
      expect.objectContaining({
        ip: "203.0.113.17",
        path: "/missi-m.png",
      }),
    )
  })

  it("blocks cross-site mutation requests before they reach API routes", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/api/v1/memory", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.12",
          origin: "https://evil.example",
          "sec-fetch-site": "cross-site",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify({ conversation: [] }),
      }),
      {} as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Cross-site requests are not allowed.",
    })
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'")
    expect(response.headers.get("X-Frame-Options")).toBe("DENY")
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      "security.cross_site_mutation_blocked",
      expect.objectContaining({
        ip: "203.0.113.12",
        path: "/api/v1/memory",
      }),
    )
  })

  it("blocks mutation requests with malformed Referer headers", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/api/v1/memory", {
        method: "POST",
        headers: {
          referer: "://bad-referer",
          "cf-connecting-ip": "203.0.113.18",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify({ conversation: [] }),
      }),
      {} as never,
    )

    expect(response.status).toBe(403)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Cross-site requests are not allowed.",
    })
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      "security.cross_site_mutation_blocked",
      expect.objectContaining({
        ip: "203.0.113.18",
        path: "/api/v1/memory",
      }),
    )
  })

  it("allows same-origin mutation requests identified by Referer", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/api/v1/memory", {
        method: "POST",
        headers: {
          referer: "https://missi.space/chat?tab=voice",
          "cf-connecting-ip": "203.0.113.19",
          "content-type": "application/json",
          "user-agent": "Mozilla/5.0",
        },
        body: JSON.stringify({ conversation: [] }),
      }),
      {} as never,
    )

    expect(response.status).toBe(200)
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'")
    expect(logSecurityEventMock).not.toHaveBeenCalledWith(
      "security.cross_site_mutation_blocked",
      expect.anything(),
    )
  })

  it("returns CORS preflight headers for API OPTIONS requests from allowed origins", async () => {
    const { default: middleware } = await loadMiddleware()
    const response = await middleware(
      makeRequest("https://missi.space/api/v1/memory", {
        method: "OPTIONS",
        headers: {
          origin: "https://missi.space",
          "cf-connecting-ip": "203.0.113.20",
          "user-agent": "Mozilla/5.0",
        },
      }),
      {} as never,
    )

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://missi.space")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
    expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'")
  })

  it("rate limits repeated auth-page requests from the same IP", async () => {
    const { default: middleware } = await loadMiddleware()
    const request = () => makeRequest("https://missi.space/sign-in", {
      headers: {
        "cf-connecting-ip": "203.0.113.30",
        "user-agent": "Mozilla/5.0",
      },
    })

    for (let count = 0; count < 30; count++) {
      const response = await middleware(request(), {} as never)
      expect(response.status).toBe(200)
    }

    const limited = await middleware(request(), {} as never)

    expect(limited.status).toBe(429)
    expect(limited.headers.get("Content-Type")).toContain("text/html")
    expect(limited.headers.get("Retry-After")).toBeTruthy()
    expect(limited.headers.get("X-RateLimit-Limit")).toBe("30")
    expect(await limited.text()).toContain("Too Many Requests")
    expect(logMock).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "warn",
        event: "auth.rate_limited",
        metadata: {
          ip: "203.0.113.30",
          path: "/sign-in",
        },
      }),
    )
  })
})
