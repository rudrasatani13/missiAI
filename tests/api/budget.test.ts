import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }))
vi.mock('@/lib/server/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() { super('Unauthenticated'); this.name = 'AuthenticationError' }
  },
  unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), { status: 401 })),
}))
vi.mock('@/services/ai.service', () => ({ callAIDirect: vi.fn() }))

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getVerifiedUserId } from '@/lib/server/auth'

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
import { GET as GET_INSIGHT, POST as POST_INSIGHT } from '@/app/api/v1/budget/insight/route'
import { GET as GET_EXPORT } from '@/app/api/v1/budget/export/route'

describe('budget API routes', () => {
  let kv: ReturnType<typeof makeKV>

  beforeEach(() => {
    vi.clearAllMocks()
    delete (globalThis as any).__MISSI_BUDGET_LOCAL_STORE__
    kv = makeKV()
    mockGetCtx.mockReturnValue({ env: { MISSI_MEMORY: kv } } as any)
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

  it('POST /entries returns 429 after 200 entries in one day', async () => {
    mockGetUser.mockResolvedValue('user-rl')
    const date = new Date().toISOString().slice(0, 10)
    // Seed rate limit at 199
    kv._store.set(`budget:ratelimit:user-rl:${date}`, '199')
    const req1 = makeReq('POST', { amount: 10, currency: 'USD', category: 'food', date }, 'http://localhost/api/v1/budget/entries')
    const res = await POST_ENTRIES(req1)
    expect(res.status).toBe(200)
    const req2 = makeReq('POST', { amount: 10, currency: 'USD', category: 'food', date }, 'http://localhost/api/v1/budget/entries')
    const res2 = await POST_ENTRIES(req2)
    expect(res2.status).toBe(429)
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
    mockGetUser.mockRejectedValueOnce(new (vi.mocked(await import('@/lib/server/auth')).AuthenticationError)())
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
