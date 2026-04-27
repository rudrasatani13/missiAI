import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/v1/life-story/[...path]/route'

// Wrappers for sub-route dispatching via catch-all path params
const getChapters = (req: Request) => GET(req, { params: Promise.resolve({ path: ['chapters'] }) })
const getUnknown = (req: Request) => GET(req, { params: Promise.resolve({ path: ['unknown'] }) })
const getTimeline = (req: Request) => GET(req, { params: Promise.resolve({ path: ['timeline'] }) })
const getYearReview = (req: Request) => GET(req, { params: Promise.resolve({ path: ['year-review'] }) })
const getConstellation = (req: Request) => GET(req, { params: Promise.resolve({ path: ['constellation'] }) })
const getExport = (req: Request) => GET(req, { params: Promise.resolve({ path: ['export'] }) })

import * as clerkNextjs from '@clerk/nextjs/server'
import * as nextOnPages from '@opennextjs/cloudflare'
import * as lifeGraph from '@/lib/memory/life-graph'
import * as chapterDetector from '@/lib/life-story/chapter-detector'
import * as yearReviewGenerator from '@/lib/life-story/year-review-generator'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn()
}))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn()
}))

vi.mock('@/lib/memory/life-graph', () => ({
  getLifeGraph: vi.fn(),
  getLifeGraphReadSnapshot: vi.fn()
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: vi.fn().mockResolvedValue('free')
}))

vi.mock('@/lib/life-story/chapter-detector', () => ({
  detectChapters: vi.fn().mockResolvedValue([{ id: 'c1', nodeIds: [] }])
}))

vi.mock('@/lib/life-story/year-review-generator', () => ({
  generateYearInReview: vi.fn().mockResolvedValue({ year: 2025 })
}))

describe('Life Story API Routes', () => {
  let mockKV: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockKV = {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(true)
    }
    vi.mocked(nextOnPages.getCloudflareContext).mockReturnValue({
      env: { MISSI_MEMORY: mockKV }
    } as any)
    vi.mocked(lifeGraph.getLifeGraph).mockResolvedValue({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 10 })
    vi.mocked(lifeGraph.getLifeGraphReadSnapshot).mockResolvedValue({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 10 })
  })

  it('all 5 routes return 401 without Clerk session', async () => {
    vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: null } as any)
    const req = new Request('https://missi.space/dummy')
    
    expect((await getChapters(req)).status).toBe(401)
    expect((await getTimeline(req)).status).toBe(401)
    expect((await getYearReview(req)).status).toBe(401)
    expect((await getConstellation(req)).status).toBe(401)
    expect((await getExport(req)).status).toBe(401)
  })

  describe('Chapters Route', () => {
    it('returns cached on fresh graph', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy')
      
      mockKV.get.mockResolvedValueOnce(JSON.stringify({
        chapters: [{ id: 'cached_chapter' }],
        graphVersion: 10, // matches mock graph version
        generatedAt: 1234
      }))

      const res = await getChapters(req)
      const data = await res.json()
      expect(data.chapters[0].id).toBe('cached_chapter')
      expect(lifeGraph.getLifeGraphReadSnapshot).toHaveBeenCalledWith(
        mockKV,
        'user_123',
        expect.objectContaining({ limit: 500, newestFirst: true }),
      )
      expect(chapterDetector.detectChapters).not.toHaveBeenCalled()
    })

    it('regenerates on version mismatch', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy')
      
      mockKV.get.mockResolvedValueOnce(JSON.stringify({
        chapters: [{ id: 'cached_chapter' }],
        graphVersion: 1, // does not match mock graph version 10
        generatedAt: 1234
      }))

      const res = await getChapters(req)
      const data = await res.json()
      expect(data.chapters[0].id).toBe('c1')
      expect(chapterDetector.detectChapters).toHaveBeenCalled()
    })

    it('bypasses cache when refresh=true', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy?refresh=true')

      mockKV.get.mockResolvedValueOnce(JSON.stringify({
        chapters: [{ id: 'cached_chapter' }],
        graphVersion: 10,
        generatedAt: 1234
      }))

      const res = await getChapters(req)
      const data = await res.json()
      expect(data.chapters[0].id).toBe('c1')
      expect(chapterDetector.detectChapters).toHaveBeenCalled()
    })

    it('returns 500 when KV binding is unavailable', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      vi.mocked(nextOnPages.getCloudflareContext).mockReturnValue({ env: {} } as any)

      const res = await getChapters(new Request('https://missi.space/dummy'))

      expect(res.status).toBe(500)
      await expect(res.json()).resolves.toEqual({ error: 'KV storage missing' })
    })
  })

  describe('Timeline Route', () => {
    it('filters timeline events by year and category while preserving chapter mapping', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy?year=2025&category=goal')

      mockKV.get.mockResolvedValueOnce(JSON.stringify({
        chapters: [{ id: 'chapter_goal', nodeIds: ['n2'] }],
        graphVersion: 10,
        generatedAt: 1234
      }))

      vi.mocked(lifeGraph.getLifeGraphReadSnapshot).mockResolvedValueOnce({
        nodes: [
          {
            id: 'n1',
            userId: 'user_123',
            category: 'event',
            title: 'Graduation Day',
            detail: 'A big milestone',
            tags: [],
            people: [],
            emotionalWeight: 0.4,
            confidence: 0.9,
            createdAt: new Date('2024-05-01T00:00:00.000Z').getTime(),
            updatedAt: 1,
            accessCount: 0,
            lastAccessedAt: 1,
            source: 'conversation'
          },
          {
            id: 'n2',
            userId: 'user_123',
            category: 'goal',
            title: 'Launch Project',
            detail: 'Shipped the first version',
            tags: [],
            people: [],
            emotionalWeight: 0.9,
            confidence: 0.9,
            createdAt: new Date('2025-06-01T00:00:00.000Z').getTime(),
            updatedAt: 1,
            accessCount: 0,
            lastAccessedAt: 1,
            source: 'conversation'
          }
        ],
        totalInteractions: 2,
        lastUpdatedAt: 0,
        version: 10
      } as any)

      const res = await getTimeline(req)
      const data = await res.json()

      expect(res.status).toBe(200)
      expect(data.chapters[0].id).toBe('chapter_goal')
      expect(data.events).toHaveLength(1)
      expect(data.events[0]).toMatchObject({
        nodeId: 'n2',
        category: 'goal',
        chapterId: 'chapter_goal'
      })
      expect(lifeGraph.getLifeGraphReadSnapshot).toHaveBeenCalledWith(
        mockKV,
        'user_123',
        expect.objectContaining({ limit: 500, newestFirst: true }),
      )
      expect(chapterDetector.detectChapters).not.toHaveBeenCalled()
    })
  })

  describe('Year Review Route', () => {
    it('returns 400 for invalid year', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy?year=abc')
      
      const res = await getYearReview(req)
      expect(res.status).toBe(400)
    })

    it('returns 429 when rate limit exceeded', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy?year=2025') // current yr is checked
      
      mockKV.get.mockImplementation((k: string) => {
        if (k.startsWith('ratelimit')) return Promise.resolve('2') // hit limit for free tier
        return Promise.resolve(null)
      })

      const res = await getYearReview(req)
      expect(res.status).toBe(429)
    })

    it('returns cached year review when present', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy?year=2025')

      mockKV.get.mockResolvedValueOnce(JSON.stringify({ year: 2025, cached: true }))

      const res = await getYearReview(req)

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ year: 2025, cached: true })
      expect(yearReviewGenerator.generateYearInReview).not.toHaveBeenCalled()
    })
  })

  describe('Export Route', () => {
    it('returns valid JSON with correct Content-Disposition header', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy')
      
      const res = await getExport(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/json')
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="missi-life-story-')
      expect(lifeGraph.getLifeGraphReadSnapshot).toHaveBeenCalledWith(mockKV, 'user_123')
    })

    it('returns 429 when export rate limit is exceeded', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy')

      mockKV.get.mockImplementation((key: string) => {
        if (key.startsWith('ratelimit:life-story-export:')) return Promise.resolve('3')
        return Promise.resolve(null)
      })

      const res = await getExport(req)

      expect(res.status).toBe(429)
      await expect(res.json()).resolves.toEqual({ error: 'Rate limit exceeded for exports today.' })
    })
  })

  describe('Constellation Route', () => {
    it('returns correct shape for mode', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy?mode=by_time')
      
      vi.mocked(lifeGraph.getLifeGraph).mockResolvedValue({
        nodes: [{ id: 'n1', createdAt: 1000 } as any],
        totalInteractions: 0,
        lastUpdatedAt: 0,
        version: 1
      })
      vi.mocked(lifeGraph.getLifeGraphReadSnapshot).mockResolvedValue({
        nodes: [{ id: 'n1', createdAt: 1000 } as any],
        totalInteractions: 0,
        lastUpdatedAt: 0,
        version: 1
      })

      const res = await getConstellation(req)
      const data = await res.json()
      expect(data.grouping.mode).toBe('by_time')
      expect(data.grouping.clusters.length).toBeGreaterThan(0)
      expect(lifeGraph.getLifeGraphReadSnapshot).toHaveBeenCalledWith(
        mockKV,
        'user_123',
        expect.objectContaining({ limit: 500, newestFirst: true }),
      )
    })

    it('returns 400 for invalid mode', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy?mode=invalid')

      const res = await getConstellation(req)

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toEqual({ error: 'Invalid mode parameter' })
    })
  })

  it('returns 404 for unknown catch-all segments', async () => {
    vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)

    const res = await getUnknown(new Request('https://missi.space/dummy'))

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Not found' })
  })
})
