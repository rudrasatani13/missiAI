import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET as getChapters } from '@/app/api/v1/life-story/chapters/route'
import { GET as getTimeline } from '@/app/api/v1/life-story/timeline/route'
import { GET as getYearReview } from '@/app/api/v1/life-story/year-review/route'
import { GET as getConstellation } from '@/app/api/v1/life-story/constellation/route'
import { GET as getExport } from '@/app/api/v1/life-story/export/route'

import * as clerkNextjs from '@clerk/nextjs/server'
import * as nextOnPages from '@cloudflare/next-on-pages'
import * as lifeGraph from '@/lib/memory/life-graph'
import * as chapterDetector from '@/lib/life-story/chapter-detector'
import * as yearReviewGenerator from '@/lib/life-story/year-review-generator'

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn()
}))

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn()
}))

vi.mock('@/lib/memory/life-graph', () => ({
  getLifeGraph: vi.fn()
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
    vi.mocked(nextOnPages.getRequestContext).mockReturnValue({
      env: { MISSI_MEMORY: mockKV }
    } as any)
    vi.mocked(lifeGraph.getLifeGraph).mockResolvedValue({ nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 10 })
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
  })

  describe('Export Route', () => {
    it('returns valid JSON with correct Content-Disposition header', async () => {
      vi.mocked(clerkNextjs.auth).mockResolvedValue({ userId: 'user_123' } as any)
      const req = new Request('https://missi.space/dummy')
      
      const res = await getExport(req)
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toBe('application/json')
      expect(res.headers.get('Content-Disposition')).toContain('attachment; filename="missi-life-story-')
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

      const res = await getConstellation(req)
      const data = await res.json()
      expect(data.grouping.mode).toBe('by_time')
      expect(data.grouping.clusters.length).toBeGreaterThan(0)
    })
  })
})
