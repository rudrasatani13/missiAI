import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  getVerifiedUserIdMock,
  unauthorizedResponseMock,
  logMock,
  logApiErrorMock,
  AuthenticationErrorMock,
} = vi.hoisted(() => {
  class AuthenticationErrorMock extends Error {
    constructor() {
      super("Unauthorized")
      this.name = "AuthenticationError"
    }
  }

  return {
    getVerifiedUserIdMock: vi.fn(),
    unauthorizedResponseMock: vi.fn(
      () =>
        new Response(
          JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    ),
    logMock: vi.fn(),
    logApiErrorMock: vi.fn(),
    AuthenticationErrorMock,
  }
})

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  unauthorizedResponse: unauthorizedResponseMock,
  AuthenticationError: AuthenticationErrorMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  log: logMock,
  logApiError: logApiErrorMock,
}))

import { POST } from "@/app/api/v1/client-errors/route"

function makeRequest(body: unknown | string): NextRequest {
  const payload = typeof body === "string" ? body : JSON.stringify(body)

  return new NextRequest("https://missi.space/api/v1/client-errors", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "cf-connecting-ip": "203.0.113.10",
      "user-agent": "Vitest UA",
    },
    body: payload,
  })
}

describe("POST /api/v1/client-errors", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue("user_123")
  })

  it("returns 401 when the user is unauthenticated", async () => {
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationErrorMock())

    const response = await POST(makeRequest({
      event: "voice_memory_autosave_error",
      message: "network down",
      metadata: {
        conversationLength: 6,
        interactionCount: 3,
      },
    }))

    expect(response.status).toBe(401)
    expect(unauthorizedResponseMock).toHaveBeenCalledTimes(1)
  })

  it("returns 400 and logs invalid payloads", async () => {
    const response = await POST(makeRequest({
      event: "unsupported_event",
      message: "network down",
    }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({
      success: false,
      error: "Invalid client error payload",
      code: "VALIDATION_ERROR",
    })
    expect(logApiErrorMock).toHaveBeenCalledWith(
      "client_errors.invalid_payload",
      expect.anything(),
      expect.objectContaining({
        userId: "user_123",
        httpStatus: 400,
        path: "/api/v1/client-errors",
        ip: "203.0.113.10",
      }),
    )
  })

  it("logs voice memory autosave errors with request context", async () => {
    const response = await POST(makeRequest({
      event: "voice_memory_autosave_error",
      message: "network down",
      metadata: {
        conversationLength: 6,
        interactionCount: 3,
      },
    }))

    expect(response.status).toBe(204)
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: "warn",
      event: "client.voice_memory_autosave_error",
      userId: "user_123",
      ip: "203.0.113.10",
      userAgent: "Vitest UA",
      metadata: {
        error: "network down",
        conversationLength: 6,
        interactionCount: 3,
      },
    }))
  })
})
