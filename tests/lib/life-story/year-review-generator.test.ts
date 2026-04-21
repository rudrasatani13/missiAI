import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateYearInReview } from '@/lib/life-story/year-review-generator'
import * as vertexClient from '@/lib/ai/vertex-client'
import { LifeGraph } from '@/types/memory'

vi.mock('@/lib/ai/vertex-client', () => ({
  geminiGenerate: vi.fn()
}))

describe('year-review-generator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filters nodes by year correctly and computes stats', async () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', tags: [], people: ['Alice'], createdAt: new Date(2025, 0, 1).getTime(), category: 'goal', emotionalWeight: 0.9, title: 'n1' },
        { id: '2', tags: [], people: ['Alice', 'Bob'], createdAt: new Date(2025, 1, 1).getTime(), category: 'goal', emotionalWeight: 0.8, title: 'n2' },
        { id: '3', tags: [], people: [], createdAt: new Date(2024, 0, 1).getTime(), category: 'habit', emotionalWeight: 0.5, title: 'n3' }, // Wrong year
        { id: '4', tags: [], people: [], createdAt: new Date(2025, 5, 1).getTime(), category: 'event', emotionalWeight: 0.2, title: 'n4' },
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }

    vi.mocked(vertexClient.geminiGenerate).mockResolvedValue({
      ok: false,
      json: vi.fn()
    } as any)

    const res = await generateYearInReview(graph, 2025)
    
    expect(res.year).toBe(2025)
    expect(res.totalMemories).toBe(3) // Excludes 2024 node
    
    // Top categories
    expect(res.topCategories[0].category).toBe('goal')
    expect(res.topCategories[0].count).toBe(2)
    
    // Top people (Alice has 1.7 weight, Bob has 0.8 weight)
    expect(res.topPeople[0]).toBe('Alice')
    expect(res.topPeople[1]).toBe('Bob')
    
    // Emotional arc
    expect(res.emotionalArc.length).toBe(12)
    expect(res.emotionalArc[0]).toBeCloseTo(9.0) // 0.9 * 10
    expect(res.emotionalArc[1]).toBeCloseTo(8.0) // 0.8 * 10
    expect(res.emotionalArc[5]).toBeCloseTo(2.0) // 0.2 * 10
    
    // Fallback narrative
    expect(res.narrative).toContain('This year was yours')
  })

  it('sanitizes narrative and highlights from Gemini', async () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', tags: [], people: [], createdAt: new Date(2025, 0, 1).getTime(), category: 'goal', emotionalWeight: 0.9, title: 'n1' },
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }

    vi.mocked(vertexClient.geminiGenerate).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{
          content: {
            parts: [{ text: '{"narrative": "A bad <script>alert(1)</script> string.", "highlights": ["Also <script>"]}' }]
          }
        }]
      })
    } as any)

    const res = await generateYearInReview(graph, 2025)
    expect(res.narrative).not.toContain('<script>')
    if (res.highlights.length > 0) {
      expect(res.highlights[0]).not.toContain('<script>')
    }
  })
})
