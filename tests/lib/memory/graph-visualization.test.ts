import { describe, expect, it } from 'vitest'
import type { LifeNode } from '@/types/memory'
import {
  buildMemoryGraphData,
  getMemoryGraphRenderSettings,
} from '@/lib/memory/graph-visualization'

function makeNode(overrides: Partial<LifeNode>): LifeNode {
  return {
    id: overrides.id ?? 'node-1',
    userId: overrides.userId ?? 'user-1',
    category: overrides.category ?? 'person',
    title: overrides.title ?? 'Title',
    detail: overrides.detail ?? 'Detail',
    tags: overrides.tags ?? [],
    people: overrides.people ?? [],
    emotionalWeight: overrides.emotionalWeight ?? 0.5,
    confidence: overrides.confidence ?? 0.5,
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    accessCount: overrides.accessCount ?? 0,
    lastAccessedAt: overrides.lastAccessedAt ?? 1,
    source: overrides.source ?? 'conversation',
  }
}

describe('graph-visualization', () => {
  it('builds link scores from shared tags, people, and category', () => {
    const nodes = [
      makeNode({
        id: 'a',
        category: 'person',
        tags: ['focus', 'health'],
        people: ['Alex'],
        emotionalWeight: 0.9,
        confidence: 0.7,
      }),
      makeNode({
        id: 'b',
        category: 'person',
        tags: ['health', 'travel'],
        people: ['Alex', 'Sam'],
        emotionalWeight: 0.2,
        confidence: 0.4,
      }),
      makeNode({
        id: 'c',
        category: 'goal',
        tags: ['travel'],
        people: ['Sam'],
      }),
    ]

    const graphData = buildMemoryGraphData(nodes)

    expect(graphData.nodes.map((node) => ({ id: node.id, val: node.val }))).toEqual([
      { id: 'a', val: 8 },
      { id: 'b', val: 3.0000000000000004 },
      { id: 'c', val: 5 },
    ])
    expect(graphData.links).toEqual([
      { source: 'a', target: 'b', value: 5.5 },
      { source: 'b', target: 'c', value: 5 },
    ])
  })

  it('reduces expensive render settings for large graphs', () => {
    expect(getMemoryGraphRenderSettings(50, 500)).toEqual({
      linkDirectionalParticles: 1,
      nodeResolution: 32,
    })

    expect(getMemoryGraphRenderSettings(300, 500)).toEqual({
      linkDirectionalParticles: 0,
      nodeResolution: 16,
    })

    expect(getMemoryGraphRenderSettings(50, 4000)).toEqual({
      linkDirectionalParticles: 0,
      nodeResolution: 16,
    })
  })
})
