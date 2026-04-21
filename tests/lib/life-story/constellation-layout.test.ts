import { describe, it, expect } from 'vitest'
import { computeConstellationLayout } from '@/lib/life-story/constellation-layout'
import { LifeGraph } from '@/types/memory'

describe('constellation-layout', () => {
  it('returns empty clusters for empty graph in all modes', () => {
    const graph: LifeGraph = { nodes: [], totalInteractions: 0, lastUpdatedAt: 0, version: 1 }
    expect(computeConstellationLayout(graph, 'by_category').clusters).toEqual([])
    expect(computeConstellationLayout(graph, 'by_time').clusters).toEqual([])
    expect(computeConstellationLayout(graph, 'by_emotion').clusters).toEqual([])
    expect(computeConstellationLayout(graph, 'by_people').clusters).toEqual([])
  })

  it('groups by_category correctly', () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', category: 'goal' },
        { id: '2', category: 'goal' },
        { id: '3', category: 'event' }
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }
    const res = computeConstellationLayout(graph, 'by_category')
    expect(res.mode).toBe('by_category')
    expect(res.clusters.length).toBe(2)
    const goalCluster = res.clusters.find(c => c.label === 'goal')
    expect(goalCluster?.nodeIds).toEqual(['1', '2'])
  })

  it('groups by_time sorts chronologically', () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', createdAt: new Date(2025, 0, 1).getTime() },
        { id: '2', createdAt: new Date(2025, 6, 1).getTime() }
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }
    const res = computeConstellationLayout(graph, 'by_time')
    expect(res.mode).toBe('by_time')
    expect(res.clusters.length).toBeGreaterThan(0)
    expect(res.clusters[0].centerX).toBeLessThan(res.clusters[res.clusters.length - 1].centerX || Infinity)
  })

  it('groups by_emotion properly', () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', emotionalWeight: 0.9 }, // High
        { id: '2', emotionalWeight: 0.5 }, // Neutral
        { id: '3', emotionalWeight: 0.1 }  // Low
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }
    const res = computeConstellationLayout(graph, 'by_emotion')
    expect(res.clusters.length).toBe(3)
    const high = res.clusters.find(c => c.label === 'High Emotion')
    expect(high?.nodeIds).toEqual(['1'])
  })

  it('groups by_people handles multiple people properly', () => {
    const graph: LifeGraph = {
      nodes: [
        { id: '1', people: ['Alice', 'Bob'] },
        { id: '2', people: ['Alice'] }
      ] as any[],
      totalInteractions: 0, lastUpdatedAt: 0, version: 1
    }
    const res = computeConstellationLayout(graph, 'by_people')
    // Nodes are assigned to their first matching person cluster only,
    // so Bob's cluster ends up empty and is filtered out
    expect(res.clusters.length).toBe(1)
    const alice = res.clusters.find(c => c.label === 'Alice')
    expect(alice?.nodeIds.length).toBeGreaterThan(0)
  })
})
