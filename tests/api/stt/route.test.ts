import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  getVerifiedUserIdMock,
  getUserPlanMock,
  getCloudflareKVBindingMock,
  checkAndIncrementVoiceTimeMock,
  checkRateLimitMock,
  geminiSpeechToTextMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  getUserPlanMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  checkAndIncrementVoiceTimeMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  geminiSpeechToTextMock: vi.fn(),
}))

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: class AuthenticationError extends Error {},
  unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }), { status: 401 })),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: getUserPlanMock,
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock("@/lib/billing/usage-tracker", () => ({
  checkAndIncrementVoiceTime: checkAndIncrementVoiceTimeMock,
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: checkRateLimitMock,
  rateLimitExceededResponse: vi.fn(() => new Response(JSON.stringify({ success: false, error: "Rate limit exceeded", code: "RATE_LIMITED" }), { status: 429 })),
  rateLimitHeaders: vi.fn(() => ({ "X-RateLimit-Limit": "60" })),
}))

vi.mock("@/lib/ai/services/voice-service", () => ({
  geminiSpeechToText: geminiSpeechToTextMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
  logApiError: vi.fn(),
}))

import { POST } from "@/app/api/v1/stt/route"

// ─── Audio byte fixtures ──────────────────────────────────────────────────────

// Valid WAV magic bytes: RIFF + 4-byte size + WAVE (12 bytes minimum)
const VALID_WAV_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, // "RIFF"
  0x24, 0x08, 0x00, 0x00, // chunk size (little-endian, not validated)
  0x57, 0x41, 0x56, 0x45, // "WAVE"
])
// Valid WebM/EBML magic bytes
const VALID_WEBM_BYTES = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x00, 0x00, 0x00, 0x00])
// Valid MP3 with ID3 tag header
const VALID_MP3_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00])
// Valid MP4/M4A ftyp box magic bytes (ftyp at offset 4)
const VALID_MP4_BYTES = new Uint8Array([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34, 0x41, 0x20])
// Non-audio bytes — JPEG magic (FF D8 FF) declared as WAV to test mismatch
const JPEG_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
// Generic garbage bytes that match no known audio signature
const GARBAGE_BYTES = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B])

// ─── Request factory helpers ──────────────────────────────────────────────────

function makeRequest(opts?: {
  bytes?: Uint8Array
  mimeType?: string
  fileName?: string
  withClientDuration?: boolean
}): NextRequest {
  const {
    bytes = VALID_WAV_BYTES,
    mimeType = "audio/wav",
    fileName = "sample.wav",
    withClientDuration = false,
  } = opts ?? {}

  const formData = new FormData()
  formData.set("audio", new File([bytes as unknown as BlobPart], fileName, { type: mimeType }))
  if (withClientDuration) {
    // Simulate client trying to under-report duration — should be ignored
    formData.set("voiceDurationMs", "1")
  }

  return new NextRequest("https://missi.space/api/v1/stt", {
    method: "POST",
    body: formData,
  })
}

function makeEmptyRequest(): NextRequest {
  return new NextRequest("https://missi.space/api/v1/stt", {
    method: "POST",
    body: new FormData(),
  })
}

describe("POST /api/v1/stt", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue("user_123")
    getUserPlanMock.mockResolvedValue("free")
    getCloudflareKVBindingMock.mockReturnValue({} as never)
    checkRateLimitMock.mockResolvedValue({ allowed: true, remaining: 59, limit: 60, resetAt: 123456, retryAfter: 60 })
    checkAndIncrementVoiceTimeMock.mockResolvedValue({ allowed: true, usedSeconds: 4, limitSeconds: 600, remainingSeconds: 596 })
    geminiSpeechToTextMock.mockResolvedValue({ text: "hello world", language: "en" })
  })

  // ── Auth ──────────────────────────────────────────────────────────────────

  it("returns 401 when not authenticated", async () => {
    const { AuthenticationError } = await import("@/lib/server/security/auth")
    getVerifiedUserIdMock.mockRejectedValueOnce(new AuthenticationError())

    const response = await POST(makeRequest())

    expect(response.status).toBe(401)
  })

  // ── FormData / file presence ──────────────────────────────────────────────

  it("returns 400 when no audio field is present", async () => {
    const response = await POST(makeEmptyRequest())

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("VALIDATION_ERROR")
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  // ── MIME type / schema validation ─────────────────────────────────────────

  it.each([
    ["video/avi",   "video/avi",   "avi"],
    ["video/mkv",   "video/mkv",   "mkv"],
    ["application/pdf", "application/pdf", "pdf"],
    ["text/plain",  "text/plain",  "txt"],
  ])("returns 400 for unsupported MIME type %s", async (_label, mimeType, ext) => {
    const response = await POST(makeRequest({ bytes: VALID_WAV_BYTES, mimeType, fileName: `test.${ext}` }))

    expect(response.status).toBe(400)
    const body = await response.json()
    // sttSchema refine returns VALIDATION_ERROR
    expect(["VALIDATION_ERROR", "INVALID_FILE"]).toContain(body.code)
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  // ── Magic-byte validation ─────────────────────────────────────────────────

  it("returns 400 when magic bytes do not match declared MIME type (JPEG declared as WAV)", async () => {
    const response = await POST(makeRequest({ bytes: JPEG_BYTES, mimeType: "audio/wav" }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("INVALID_FILE")
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when magic bytes do not match for MP3 declared as OGG", async () => {
    const response = await POST(makeRequest({ bytes: VALID_MP3_BYTES, mimeType: "audio/ogg" }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("INVALID_FILE")
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when garbage bytes are declared as application/octet-stream", async () => {
    const response = await POST(makeRequest({ bytes: GARBAGE_BYTES, mimeType: "application/octet-stream" }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("INVALID_FILE")
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  it("accepts WebM bytes declared as audio/webm", async () => {
    const response = await POST(makeRequest({ bytes: VALID_WEBM_BYTES, mimeType: "audio/webm" }))

    expect(response.status).toBe(200)
    expect(geminiSpeechToTextMock).toHaveBeenCalled()
  })

  it("accepts WebM bytes declared as video/webm (Safari/iOS compat)", async () => {
    const response = await POST(makeRequest({ bytes: VALID_WEBM_BYTES, mimeType: "video/webm" }))

    expect(response.status).toBe(200)
    expect(geminiSpeechToTextMock).toHaveBeenCalled()
  })

  it("accepts MP4 bytes declared as video/mp4 (Safari/iOS compat)", async () => {
    const response = await POST(makeRequest({ bytes: VALID_MP4_BYTES, mimeType: "video/mp4" }))

    expect(response.status).toBe(200)
    expect(geminiSpeechToTextMock).toHaveBeenCalled()
  })

  it("accepts valid WAV bytes declared as audio/webm;codecs=opus (codec params stripped)", async () => {
    // audio/webm;codecs=opus normalises to audio/webm, but bytes are WAV not WebM
    // → expect rejection because WAV bytes fail WebM magic-byte check
    const response = await POST(makeRequest({ bytes: VALID_WAV_BYTES, mimeType: "audio/webm;codecs=opus" }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("INVALID_FILE")
  })

  it("accepts WAV bytes with codec-param stripped WebM type correctly when actual WebM bytes are provided", async () => {
    const response = await POST(makeRequest({ bytes: VALID_WEBM_BYTES, mimeType: "audio/webm;codecs=opus" }))

    expect(response.status).toBe(200)
    expect(geminiSpeechToTextMock).toHaveBeenCalled()
  })

  // ── File size ─────────────────────────────────────────────────────────────

  it("returns 400 when file size is zero (empty file)", async () => {
    const response = await POST(makeRequest({ bytes: new Uint8Array(0) }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("VALIDATION_ERROR")
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  it("returns 400 when file exceeds 10 MB size limit", async () => {
    const bigBytes = new Uint8Array(10_000_001)
    // Set valid WAV magic bytes so we don't hit magic-byte rejection first
    bigBytes.set(VALID_WAV_BYTES)

    const response = await POST(makeRequest({ bytes: bigBytes }))

    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.code).toBe("VALIDATION_ERROR")
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  // ── Rate limiting ─────────────────────────────────────────────────────────

  it("returns 429 when API rate limit is exceeded", async () => {
    checkRateLimitMock.mockResolvedValueOnce({ allowed: false, remaining: 0, limit: 60, resetAt: 123456, retryAfter: 60 })

    const response = await POST(makeRequest())

    expect(response.status).toBe(429)
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  // ── Voice quota ───────────────────────────────────────────────────────────

  it("returns 429 when daily voice quota is exhausted", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 600,
      limitSeconds: 600,
      remainingSeconds: 0,
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body.code).toBe("USAGE_LIMIT_EXCEEDED")
    expect(body.upgrade).toBe("/pricing")
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  it("returns 503 when the voice quota service is unavailable", async () => {
    checkAndIncrementVoiceTimeMock.mockResolvedValueOnce({
      allowed: false,
      usedSeconds: 0,
      limitSeconds: 600,
      remainingSeconds: 0,
      unavailable: true,
    })

    const response = await POST(makeRequest())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Service temporarily unavailable",
      code: "SERVICE_UNAVAILABLE",
    })
    expect(geminiSpeechToTextMock).not.toHaveBeenCalled()
  })

  // ── Duration / quota source-of-truth ──────────────────────────────────────

  it("charges quota based on file size estimate, not client-supplied voiceDurationMs", async () => {
    // Client sends 1 ms to try to under-report; server must ignore it.
    // Valid WAV bytes = 12 bytes → estimateAudioDurationMs(12) = max(3000, round(12/8000*1000)) = 3000 ms
    // sanitizeDuration(3000) = max(3, ceil(3000/1000)) = 3 seconds
    const response = await POST(makeRequest({ withClientDuration: true }))

    expect(response.status).toBe(200)
    expect(checkAndIncrementVoiceTimeMock).toHaveBeenCalledWith(
      expect.anything(), // kv
      "user_123",
      "free",
      3000, // file-size-based estimate for 12-byte file, not the client-supplied 1 ms
    )
  })

  // ── Happy path ────────────────────────────────────────────────────────────

  it("returns 200 with transcription on valid WAV upload", async () => {
    const response = await POST(makeRequest())

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.success).toBe(true)
    expect(body.data).toEqual({ text: "hello world", language: "en" })
    expect(geminiSpeechToTextMock).toHaveBeenCalledTimes(1)
  })

  it("returns 200 with transcription on valid MP3 upload", async () => {
    const response = await POST(makeRequest({ bytes: VALID_MP3_BYTES, mimeType: "audio/mpeg", fileName: "recording.mp3" }))

    expect(response.status).toBe(200)
    expect(geminiSpeechToTextMock).toHaveBeenCalled()
  })
})
