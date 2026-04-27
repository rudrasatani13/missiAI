import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectChapters, sanitizeNarrativeText } from '@/lib/life-story/chapter-detector'
import * as vertexClient from '@/lib/ai/providers/vertex-client'
import { LifeGraph } from '@/types/memory'

vi.mock('@/lib/ai/providers/vertex-client', () => ({
  geminiGenerate: vi.fn()
}))

describe('chapter-detector', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sanitizeNarrativeText sanitizes HTML and URLs', () => {
    const text = 'Here is a <script>alert(1)</script> memory. Find me at https://hack.com and +1-555-1234.'
    const result = sanitizeNarrativeText(text, 'fallback')
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('https://hack.com')
    expect(result).not.toContain('+1-555-1234')
  })

  it('returns empty array when graph has fewer than 5 nodes', async () => {
    const graph: LifeGraph = { nodes: [{ id: '1' } as any, { id: '2' } as any], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }
    const res = await detectChapters(graph)
    expect(res).toEqual([])
  })

  it('clusters based on shared tags correctly', async () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', tags: ['music', 'guitar'], people: [], createdAt: 1000, category: 'goal', title: 'n1' },
        { id: '2', tags: ['music', 'guitar'], people: [], createdAt: 2000, category: 'goal', title: 'n2' },
        { id: '3', tags: ['music', 'guitar'], people: [], createdAt: 3000, category: 'goal', title: 'n3' },
        { id: '4', tags: ['other'], people: [], createdAt: 4000, category: 'place', title: 'n4' },
        { id: '5', tags: ['other'], people: [], createdAt: 5000, category: 'place', title: 'n5' }
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }

    vi.mocked(vertexClient.geminiGenerate).mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({})
    } as any)

    const res = await detectChapters(graph)
    
    // Expect 1 cluster (n1, n2, n3, plus n4, n5 which are merged as "misc" because <3 size)
    // Wait, since all are in same time bucket (createdAt near 1000-5000 is same year/quarter)
    // We should get multiple clusters or one merged. 
    // They share same bucket. n1,n2,n3 is a cluster of 3. n4,n5 is a cluster of 2 (merged into misc => cluster of 2).
    // Because misc > 0, it is added as a cluster. So we expect 2 chapters.
    expect(res.length).toBe(2)
  })

  it('falls back to mechanical title when Gemini fails', async () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', tags: ['a','b'], people: [], createdAt: 1000, category: 'goal', title: 'n1' },
        { id: '2', tags: ['a','b'], people: [], createdAt: 2000, category: 'goal', title: 'n2' },
        { id: '3', tags: ['a','b'], people: [], createdAt: 3000, category: 'goal', title: 'n3' },
        { id: '4', tags: ['a','b'], people: [], createdAt: 4000, category: 'goal', title: 'n4' },
        { id: '5', tags: ['a','b'], people: [], createdAt: 5000, category: 'goal', title: 'n5' }
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }

    vi.mocked(vertexClient.geminiGenerate).mockResolvedValue({
      ok: false,
      json: vi.fn()
    } as any)

    const res = await detectChapters(graph)
    expect(res.length).toBe(1)
    expect(res[0].title).toContain('Goal:')
    expect(res[0].emotionalTone).toBe('neutral')
  })

  it('sanitizes all Gemini output', async () => {
    const graph: LifeGraph = {
      nodes: Array(5).fill({}).map((_, i) => ({
        id: String(i), tags: ['x','y'], people: [], createdAt: i*1000, category: 'event', title: 't'
      })) as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }

    vi.mocked(vertexClient.geminiGenerate).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{
          content: {
            parts: [{ text: '{"title": "Bad <script>alert(1)</script>", "emotionalTone": "joyful"}' }]
          }
        }]
      })
    } as any)

    const res = await detectChapters(graph)
    expect(res[0].title).not.toContain('<script>')
    expect(res[0].emotionalTone).toBe('joyful')
  })
})
