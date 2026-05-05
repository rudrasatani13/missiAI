import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { checkAndIncrementAtomicCounterMock, checkAtomicCounterMock } = vi.hoisted(() => ({
  checkAndIncrementAtomicCounterMock: vi.fn(),
  checkAtomicCounterMock: vi.fn(),
}))

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }))
vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() { super('Unauthenticated'); this.name = 'AuthenticationError' }
  },
  unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), { status: 401 })),
}))
vi.mock('@/lib/ai/services/ai-service', () => ({ callGeminiDirect: vi.fn() }))
vi.mock('@/lib/server/platform/atomic-quota', () => ({
  checkAndIncrementAtomicCounter: checkAndIncrementAtomicCounterMock,
  checkAtomicCounter: checkAtomicCounterMock,
}))
vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: vi.fn().mockResolvedValue('free'),
}))

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getVerifiedUserId } from '@/lib/server/security/auth'

const mockGetCtx = vi.mocked(getCloudflareContext)
const mockGetUser = vi.mocked(getVerifiedUserId)

function makeKV() {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string, _opts?: any) => { store.set(k, v) },
    delete: async (k: string) => { store.delete(k) },
    _store: store,
  }
}

import { GET as GET_SETTINGS, POST as POST_SETTINGS } from '@/app/api/v1/budget/settings/route'
import { GET as GET_ENTRIES, POST as POST_ENTRIES } from '@/app/api/v1/budget/entries/route'
import { PATCH as PATCH_ENTRY, DELETE as DELETE_ENTRY } from '@/app/api/v1/budget/entries/[entryId]/route'
import { GET as GET_REPORT } from '@/app/api/v1/budget/report/route'
import { GET as GET_INSIGHT } from '@/app/api/v1/budget/insight/route'
import { GET as GET_EXPORT } from '@/app/api/v1/budget/export/route'

describe('budget API routes', () => {
  let kv: ReturnType<typeof makeKV>

  beforeEach(() => {
    vi.clearAllMocks()
    delete (globalThis as any).__MISSI_BUDGET_LOCAL_STORE__
    kv = makeKV()
    mockGetCtx.mockReturnValue({ env: { MISSI_MEMORY: kv } } as any)
    checkAndIncrementAtomicCounterMock.mockResolvedValue({ allowed: true, count: 1, remaining: 199 })
    checkAtomicCounterMock.mockResolvedValue({ allowed: true, count: 0, remaining: 60 })
  })

  function makeReq(method: string, body?: unknown, url?: string) {
    return new NextRequest(url ?? 'http://localhost/api/v1/budget/settings', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  }

  it('GET /settings returns default USD for new user', async () => {
    mockGetUser.mockResolvedValueOnce('user-new')
    const res = await GET_SETTINGS()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.settings.preferredCurrency).toBe('USD')
  })

  it('POST /settings updates currency and limits', async () => {
    mockGetUser.mockResolvedValueOnce('user-settings')
    const req = makeReq('POST', { preferredCurrency: 'EUR', limits: [{ category: 'food', amount: 300, currency: 'EUR' }] })
    const res = await POST_SETTINGS(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.settings.preferredCurrency).toBe('EUR')
    expect(data.settings.limits).toHaveLength(1)
  })

  it('POST /settings rejects invalid category', async () => {
    mockGetUser.mockResolvedValueOnce('user-bad-cat')
    const req = makeReq('POST', { limits: [{ category: 'crypto', amount: 100, currency: 'USD' }] })
    const res = await POST_SETTINGS(req)
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.settings.limits[0].category).toBe('other')
  })

  it('POST /entries creates an expense and GET /entries lists it', async () => {
    mockGetUser.mockResolvedValue('user-entry')
    const req = makeReq('POST', { amount: 42.5, currency: 'USD', category: 'food', description: 'Lunch', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const postRes = await POST_ENTRIES(req)
    expect(postRes.status).toBe(200)
    const postData = await postRes.json()
    expect(postData.entry.amount).toBe(42.5)

    const getRes = await GET_ENTRIES(new NextRequest('http://localhost/api/v1/budget/entries?month=2026-04'))
    const getData = await getRes.json()
    expect(getData.entries).toHaveLength(1)
  })

  it('POST /entries rejects invalid currency', async () => {
    mockGetUser.mockResolvedValueOnce('user-bad')
    const req = makeReq('POST', { amount: 10, currency: 'XYZ', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    expect(res.status).toBe(400)
  })

  it('POST /entries rejects non-positive amount', async () => {
    mockGetUser.mockResolvedValueOnce('user-zero')
    const req = makeReq('POST', { amount: 0, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    expect(res.status).toBe(400)
  })

  it('POST /entries rejects Infinity as amount (item 9: non-finite guard)', async () => {
    mockGetUser.mockResolvedValueOnce('user-inf')
    const req = makeReq('POST', { amount: Infinity, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    expect(res.status).toBe(400)
  })

  it('POST /entries rejects negative Infinity as amount', async () => {
    mockGetUser.mockResolvedValueOnce('user-neg-inf')
    const req = makeReq('POST', { amount: -Infinity, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    expect(res.status).toBe(400)
  })

  it('POST /entries rejects NaN as amount', async () => {
    mockGetUser.mockResolvedValueOnce('user-nan')
    const req = makeReq('POST', { amount: NaN, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    expect(res.status).toBe(400)
  })

  it('POST /entries rejects amounts above BUDGET_MAX_AMOUNT (1,000,000,001 > 1,000,000,000)', async () => {
    mockGetUser.mockResolvedValueOnce('user-huge')
    const req = makeReq('POST', { amount: 1_000_000_001, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Amount too large')
  })

  it('POST /entries accepts amount exactly at the maximum boundary (1,000,000,000)', async () => {
    mockGetUser.mockResolvedValue('user-boundary')
    const date = new Date().toISOString().slice(0, 10)
    const req = makeReq('POST', { amount: 1_000_000_000, currency: 'USD', category: 'food', date }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.entry.amount).toBe(1_000_000_000)
  })

  it('POST /entries returns 429 when the atomic daily entry limit is exceeded', async () => {
    mockGetUser.mockResolvedValue('user-rl')
    const date = new Date().toISOString().slice(0, 10)
    checkAndIncrementAtomicCounterMock.mockResolvedValueOnce({ allowed: false, count: 200, remaining: 0 })

    const req = makeReq('POST', { amount: 10, currency: 'USD', category: 'food', date }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)

    expect(res.status).toBe(429)
  })

  it('POST /entries returns 503 when the atomic rate limit service is unavailable', async () => {
    mockGetUser.mockResolvedValue('user-rl-unavailable')
    checkAndIncrementAtomicCounterMock.mockResolvedValueOnce(null)
    const date = new Date().toISOString().slice(0, 10)

    const req = makeReq('POST', { amount: 10, currency: 'USD', category: 'food', date }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req)
    const data = await res.json()

    expect(res.status).toBe(503)
    expect(data).toEqual({ success: false, error: 'Rate limit service unavailable' })
  })

  it('PATCH /entries/[id] updates entry', async () => {
    mockGetUser.mockResolvedValue('user-patch')
    const postReq = makeReq('POST', { amount: 10, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const postRes = await POST_ENTRIES(postReq)
    const { entry } = await postRes.json()

    const patchReq = makeReq('PATCH', { amount: 15, description: 'Updated' }, `http://localhost/api/v1/budget/entries/${entry.id}`)
    const patchRes = await PATCH_ENTRY(patchReq, { params: Promise.resolve({ entryId: entry.id }) })
    expect(patchRes.status).toBe(200)
    const patchData = await patchRes.json()
    expect(patchData.entry.amount).toBe(15)
    expect(patchData.entry.description).toBe('Updated')
  })

  it('PATCH /entries/[id] returns 404 for a legacy-only older entry after legacy support removal', async () => {
    mockGetUser.mockResolvedValue('user-patch-legacy')
    kv._store.set('budget:entries:user-patch-legacy:2026-01', JSON.stringify([
      {
        id: 'legacy-entry-1',
        userId: 'user-patch-legacy',
        amount: 10,
        currency: 'USD',
        category: 'food',
        description: 'Old lunch',
        date: '2026-01-21',
        createdAt: 1,
        updatedAt: 1,
        source: 'manual',
      },
    ]))

    const patchReq = makeReq('PATCH', { amount: 15, description: 'Updated legacy' }, 'http://localhost/api/v1/budget/entries/legacy-entry-1')
    const patchRes = await PATCH_ENTRY(patchReq, { params: Promise.resolve({ entryId: 'legacy-entry-1' }) })
    expect(patchRes.status).toBe(404)

    const janRes = await GET_ENTRIES(new NextRequest('http://localhost/api/v1/budget/entries?month=2026-01'))
    const janData = await janRes.json()
    expect(janData.entries).toHaveLength(0)
  })

  it('DELETE /entries/[id] removes entry', async () => {
    mockGetUser.mockResolvedValue('user-del')
    const postReq = makeReq('POST', { amount: 10, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries')
    const postRes = await POST_ENTRIES(postReq)
    const { entry } = await postRes.json()

    const delRes = await DELETE_ENTRY(
      new NextRequest(`http://localhost/api/v1/budget/entries/${entry.id}`),
      { params: Promise.resolve({ entryId: entry.id }) }
    )
    expect(delRes.status).toBe(200)

    const getRes = await GET_ENTRIES(new NextRequest('http://localhost/api/v1/budget/entries?month=2026-04'))
    const getData = await getRes.json()
    expect(getData.entries).toHaveLength(0)
  })

  it('DELETE /entries/[id] returns 404 for a legacy-only older entry after legacy support removal', async () => {
    mockGetUser.mockResolvedValue('user-del-legacy')
    kv._store.set('budget:entries:user-del-legacy:2026-01', JSON.stringify([
      {
        id: 'legacy-entry-2',
        userId: 'user-del-legacy',
        amount: 20,
        currency: 'USD',
        category: 'transport',
        description: 'Old bus',
        date: '2026-01-10',
        createdAt: 2,
        updatedAt: 2,
        source: 'manual',
      },
    ]))

    const delRes = await DELETE_ENTRY(
      new NextRequest('http://localhost/api/v1/budget/entries/legacy-entry-2'),
      { params: Promise.resolve({ entryId: 'legacy-entry-2' }) },
    )
    expect(delRes.status).toBe(404)

    const janRes = await GET_ENTRIES(new NextRequest('http://localhost/api/v1/budget/entries?month=2026-01'))
    const janData = await janRes.json()
    expect(janData.entries).toHaveLength(0)
  })

  it('GET /report returns monthly report', async () => {
    mockGetUser.mockResolvedValue('user-report')
    await POST_ENTRIES(makeReq('POST', { amount: 100, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries'))
    const res = await GET_REPORT(new NextRequest('http://localhost/api/v1/budget/report?month=2026-04'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.report.total).toBe(100)
  })

  it('GET /insight returns insight', async () => {
    mockGetUser.mockResolvedValue('user-insight')
    await POST_ENTRIES(makeReq('POST', { amount: 50, currency: 'USD', category: 'food', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries'))
    const res = await GET_INSIGHT(new NextRequest('http://localhost/api/v1/budget/insight?month=2026-04'))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.insight.topCategory).toBe('food')
  })

  it('GET /export returns CSV with escaped fields', async () => {
    mockGetUser.mockResolvedValue('user-export')
    await POST_ENTRIES(makeReq('POST', { amount: 10, currency: 'USD', category: 'food', description: '=SUM(A1)', date: '2026-04-21' }, 'http://localhost/api/v1/budget/entries'))
    const res = await GET_EXPORT(new NextRequest('http://localhost/api/v1/budget/export?month=2026-04'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/csv')
    const body = await res.text()
    expect(body).toContain("'=SUM(A1)")
  })

  it('all routes return 401 when unauthenticated', async () => {
    mockGetUser.mockRejectedValueOnce(new (vi.mocked(await import('@/lib/server/security/auth')).AuthenticationError)())
    const res = await GET_SETTINGS()
    expect(res.status).toBe(401)
  })

  it('routes fall back to local store when KV unavailable', async () => {
    mockGetCtx.mockImplementation(() => { throw new Error('No CF') })
    delete (globalThis as any).__MISSI_BUDGET_LOCAL_STORE__
    mockGetUser.mockResolvedValueOnce('user-no-kv')
    const res = await GET_SETTINGS()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})
