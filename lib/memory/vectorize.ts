import type { LifeNode, MemoryCategory, MemorySearchResult } from '@/types/memory'

// ─── Cloudflare Vectorize Type Definitions ────────────────────────────────────
// NOTE: If @cloudflare/workers-types is updated to include Vectorize types,
// these local definitions can be removed in favour of the official ones.

export interface VectorizeVector {
  id: string
  values: number[]
  metadata?: Record<string, string | number | boolean>
}

export interface VectorizeMatch {
  id: string
  score: number
  metadata?: Record<string, string | number | boolean> | null
}

export interface VectorizeMatches {
  matches: VectorizeMatch[]
  count: number
}

export interface VectorizeIndex {
  upsert(vectors: VectorizeVector[]): Promise<{ count: number }>
  query(
    vector: number[],
    options: {
      topK?: number
      filter?: Record<string, string>
      returnMetadata?: boolean | 'all'
    },
  ): Promise<VectorizeMatches>
  deleteByIds(ids: string[]): Promise<{ count: number }>
}

export interface VectorizeEnv {
  LIFE_GRAPH: VectorizeIndex
}

// ─── Vectorize Operations ─────────────────────────────────────────────────────

export async function upsertLifeNode(
  env: VectorizeEnv,
  node: LifeNode,
  embedding: number[],
): Promise<void> {
  await env.LIFE_GRAPH.upsert([
    {
      id: node.id,
      values: embedding,
      metadata: {
        userId: node.userId,
        category: node.category,
        title: node.title,
        detail: node.detail,
        tags: JSON.stringify(node.tags),
        people: JSON.stringify(node.people),
        emotionalWeight: node.emotionalWeight,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      },
    },
  ])
}

export async function searchSimilarNodes(
  env: VectorizeEnv,
  queryEmbedding: number[],
  userId: string,
  options: {
    topK?: number
    category?: MemoryCategory
    minScore?: number
  } = {},
): Promise<MemorySearchResult[]> {
  const topK = options.topK ?? 10
  const minScore = options.minScore ?? 0.65

  const results = await env.LIFE_GRAPH.query(queryEmbedding, {
    topK,
    filter: { userId },
    returnMetadata: 'all',
  })

  let matches = results.matches.filter((m) => m.score >= minScore)

  if (options.category) {
    matches = matches.filter(
      (m) => m.metadata?.category === options.category,
    )
  }

  matches.sort((a, b) => b.score - a.score)

  return matches.map((m) => ({
    node: {
      id: m.id,
      userId: (m.metadata?.userId as string) ?? userId,
      category: (m.metadata?.category as MemoryCategory) ?? 'preference',
      title: (m.metadata?.title as string) ?? '',
      detail: (m.metadata?.detail as string) ?? '',
      tags: safeParseArray(m.metadata?.tags),
      people: safeParseArray(m.metadata?.people),
      emotionalWeight: (m.metadata?.emotionalWeight as number) ?? 0.5,
      confidence: 0.8,
      createdAt: (m.metadata?.createdAt as number) ?? 0,
      updatedAt: (m.metadata?.updatedAt as number) ?? 0,
      accessCount: 0,
      lastAccessedAt: 0,
      source: 'conversation' as const,
    },
    score: m.score,
    reason: `Semantically similar (score: ${m.score.toFixed(2)})`,
  }))
}

export async function deleteUserVectors(
  env: VectorizeEnv,
  nodeIds: string[],
): Promise<void> {
  if (nodeIds.length === 0) return
  await env.LIFE_GRAPH.deleteByIds(nodeIds)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safeParseArray(val: unknown): string[] {
  if (typeof val !== 'string') return []
  try {
    const parsed = JSON.parse(val)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}
