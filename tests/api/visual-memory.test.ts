import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Mocks (must be declared before imports) ──────────────────────────────────

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() {
      super('Unauthenticated')
      this.name = 'AuthenticationError'
    }
  },
  unauthorizedResponse: vi.fn(
    () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  ),
}))

vi.mock('@/lib/server/logger', () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: vi.fn(() => Promise.resolve('free')),
}))

vi.mock('@/lib/visual-memory/visual-store', () => ({
  getVisualRateLimit: vi.fn(() => Promise.resolve(0)),
  incrementVisualRateLimit: vi.fn(() => Promise.resolve()),
  addVisualRecord: vi.fn(() => Promise.resolve()),
  getVisualRecords: vi.fn(() => Promise.resolve([])),
  deleteVisualRecord: vi.fn(() => Promise.resolve()),
}))

vi.mock('@/lib/visual-memory/image-analyzer', () => ({
  analyzeImageWithGemini: vi.fn(() =>
    Promise.resolve({
      category: 'food',
      title: 'Test restaurant menu',
      detail: 'Butter chicken ₹450',
      structuredData: '₹450',
      tags: ['restaurant', 'food'],
      people: [],
      emotionalWeight: 0.4,
      recallHint: 'Woh restaurant mein kya tha?',
    }),
  ),
  mapExtractionToLifeNode: vi.fn(() => ({
    userId: 'user-1',
    category: 'preference',
    title: 'Test restaurant menu',
    detail: 'Butter chicken ₹450 | Data: ₹450',
    tags: ['restaurant', 'food'],
    people: [],
    emotionalWeight: 0.4,
    confidence: 0.85,
    source: 'visual',
  })),
}))

vi.mock('@/lib/memory/life-graph', () => ({
  addOrUpdateNode: vi.fn(() =>
    Promise.resolve({
      id: 'node-abc123',
      userId: 'user-1',
      category: 'preference',
      title: 'Test restaurant menu',
      detail: 'Butter chicken ₹450',
      tags: ['restaurant', 'food'],
      people: [],
      emotionalWeight: 0.4,
      confidence: 0.85,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: 0,
      source: 'visual',
    }),
  ),
}))

vi.mock('@/lib/gamification/xp-engine', () => ({
  awardXP: vi.fn(() => Promise.resolve(1)),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import { GET as _GET, DELETE as _DELETE, POST as _POST } from '@/app/api/v1/visual-memory/[[...path]]/route'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// Wrappers for catch-all path dispatch
const basePath = { params: Promise.resolve({ path: undefined as string[] | undefined }) }
const analyzePost = (req: NextRequest) => _POST(req, { params: Promise.resolve({ path: ['analyze'] }) } as any)
const GET = (req: NextRequest) => _GET(req, basePath as any)
const DELETE = (req: NextRequest) => _DELETE(req, basePath as any)
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import {
  getVisualRateLimit,
  getVisualRecords,
  deleteVisualRecord,
} from '@/lib/visual-memory/visual-store'
import { getUserPlan } from '@/lib/billing/tier-checker'

const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockGetVisualRateLimit = vi.mocked(getVisualRateLimit)
const mockGetVisualRecords = vi.mocked(getVisualRecords)
const mockGetUserPlan = vi.mocked(getUserPlan)

// ─── KV Mock Factory ──────────────────────────────────────────────────────────

function makeKV() {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

// ─── Image Byte Helpers ───────────────────────────────────────────────────────

// Valid JPEG magic bytes (FF D8 FF E0 + padding)
const VALID_JPEG_BYTES = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01])
// Valid PNG magic bytes
const VALID_PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
// PNG bytes but declared as image/jpeg (magic bytes mismatch)
const PNG_AS_JPEG_BYTES = VALID_PNG_BYTES

function makeFormData(bytes: Uint8Array, mimeType: string, note?: string): FormData {
  const file = new File([bytes as any], 'test.jpg', { type: mimeType })
  const fd = new FormData()
  fd.append('file', file)
  if (note) fd.append('note', note)
  return fd
}

function makeAnalyzeRequest(formData: FormData): NextRequest {
  return new NextRequest('http://localhost/api/v1/visual-memory/analyze', {
    method: 'POST',
    body: formData,
  })
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  const kv = makeKV()
  mockGetRequestContext.mockReturnValue({
    env: { MISSI_MEMORY: kv, LIFE_GRAPH: null } as any,
    ctx: {} as any,
    cf: {} as any,
  })

  mockGetVerifiedUserId.mockResolvedValue('user-1')
  mockGetVisualRateLimit.mockResolvedValue(0)
  mockGetUserPlan.mockResolvedValue('free')
})

// ─── POST /api/v1/visual-memory/analyze ──────────────────────────────────────

describe('POST /api/v1/visual-memory/analyze', () => {
  it('returns 401 with no Clerk session', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const fd = makeFormData(VALID_JPEG_BYTES, 'image/jpeg')
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(401)
    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it.each([
    ['application/pdf', 'application/pdf'],
    ['text/plain', 'text/plain'],
    ['image/gif', 'image/gif'],
    ['video/mp4', 'video/mp4'],
  ])('returns 415 with unsupported MIME type: %s', async (_label, mimeType) => {
    const bytes = new Uint8Array([0x00, 0x01, 0x02, 0x03])
    const fd = makeFormData(bytes, mimeType)
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(415)
    const body = await res.json()
    expect(body.code).toBe('UNSUPPORTED_MEDIA_TYPE')
  })

  it('returns 413 when file exceeds 5MB', async () => {
    // Create a buffer larger than 5MB with valid JPEG magic bytes
    const bigBytes = new Uint8Array(5_242_881)
    bigBytes[0] = 0xFF; bigBytes[1] = 0xD8; bigBytes[2] = 0xFF
    const fd = makeFormData(bigBytes, 'image/jpeg')
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(413)
    const body = await res.json()
    expect(body.code).toBe('PAYLOAD_TOO_LARGE')
  })

  it('returns 400 when magic bytes do not match declared MIME type', async () => {
    // PNG bytes declared as image/jpeg
    const fd = makeFormData(PNG_AS_JPEG_BYTES, 'image/jpeg')
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('INVALID_FILE')
  })

  it('returns 429 when rate limit is exceeded', async () => {
    mockGetVisualRateLimit.mockResolvedValueOnce(10) // free plan limit is 10

    const fd = makeFormData(VALID_JPEG_BYTES, 'image/jpeg')
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED')
  })

  it('returns 400 when note field exceeds 200 chars', async () => {
    const fd = makeFormData(VALID_JPEG_BYTES, 'image/jpeg')
    fd.append('note', 'x'.repeat(201))
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(400)
  })

  it('successfully processes a valid JPEG image and returns extraction fields', async () => {
    const fd = makeFormData(VALID_JPEG_BYTES, 'image/jpeg', 'Good food at a restaurant')
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.nodeId).toBe('node-abc123')
    expect(body.category).toBe('food')
    expect(body.title).toBeTruthy()
    expect(body.recallHint).toBeTruthy()
    expect(Array.isArray(body.tags)).toBe(true)
  })

  it('response NEVER contains base64 image data or raw bytes', async () => {
    const fd = makeFormData(VALID_JPEG_BYTES, 'image/jpeg')
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    const bodyText = await res.text()

    // base64 data URLs start with "data:image"
    expect(bodyText).not.toContain('data:image')
    // Raw base64 strings are very long sequences of alphanumeric chars
    // Check that no field contains a suspiciously long base64 blob (>200 chars without spaces)
    const longBase64 = /[A-Za-z0-9+/]{200,}/
    expect(bodyText).not.toMatch(longBase64)
  })

  it('returns 500 when KV is unavailable', async () => {
    mockGetRequestContext.mockReturnValueOnce({
      env: { MISSI_MEMORY: null, LIFE_GRAPH: null } as any,
      ctx: {} as any,
      cf: {} as any,
    })

    const fd = makeFormData(VALID_JPEG_BYTES, 'image/jpeg')
    const req = makeAnalyzeRequest(fd)
    const res = await analyzePost(req)

    expect(res.status).toBe(500)
  })
})

// ─── GET /api/v1/visual-memory ────────────────────────────────────────────────

describe('GET /api/v1/visual-memory', () => {
  it('returns 401 with no Clerk session', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = new NextRequest('http://localhost/api/v1/visual-memory')
    const res = await GET(req)

    expect(res.status).toBe(401)
  })

  it('returns visual records for authenticated user', async () => {
    mockGetVisualRecords.mockResolvedValueOnce([
      {
        nodeId: 'node-1',
        processedDate: '2026-04-14',
        category: 'food',
        summary: 'Restaurant menu',
        userNote: null,
        tags: ['food'],
        createdAt: Date.now(),
      },
    ])

    const req = new NextRequest('http://localhost/api/v1/visual-memory')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.records).toHaveLength(1)
    expect(body.records[0].nodeId).toBe('node-1')
  })

  it('returns empty records array when user has no visual memories', async () => {
    mockGetVisualRecords.mockResolvedValueOnce([])

    const req = new NextRequest('http://localhost/api/v1/visual-memory')
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.records).toEqual([])
  })
})

// ─── DELETE /api/v1/visual-memory ────────────────────────────────────────────

describe('DELETE /api/v1/visual-memory', () => {
  it('returns 401 with no Clerk session', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = new NextRequest('http://localhost/api/v1/visual-memory', {
      method: 'DELETE',
      body: JSON.stringify({ nodeId: 'node-1' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await DELETE(req)

    expect(res.status).toBe(401)
  })

  it('returns 400 on invalid (missing) nodeId', async () => {
    const req = new NextRequest('http://localhost/api/v1/visual-memory', {
      method: 'DELETE',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await DELETE(req)

    expect(res.status).toBe(400)
  })

  it('successfully removes record and returns success', async () => {
    const req = new NextRequest('http://localhost/api/v1/visual-memory', {
      method: 'DELETE',
      body: JSON.stringify({ nodeId: 'node-abc123' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await DELETE(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(deleteVisualRecord).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'node-abc123',
    )
  })

  it('returns 400 when nodeId is too long (>20 chars)', async () => {
    const req = new NextRequest('http://localhost/api/v1/visual-memory', {
      method: 'DELETE',
      body: JSON.stringify({ nodeId: 'x'.repeat(21) }),
      headers: { 'Content-Type': 'application/json' },
    })
    const res = await DELETE(req)

    expect(res.status).toBe(400)
  })
})
