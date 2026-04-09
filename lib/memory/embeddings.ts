import type { LifeNode } from '@/types/memory'
import { geminiEmbed } from '@/lib/ai/vertex-client'

const EMBEDDING_TIMEOUT_MS = 10_000

/**
 * Generate a 768-dimension embedding via Gemini text-embedding-004.
 * Automatically routes through Vertex AI or Google AI Studio based on
 * the AI_BACKEND environment variable. The apiKey parameter is kept for
 * backward compatibility but is ignored when using Vertex AI.
 */
export async function generateEmbedding(
  text: string,
  _apiKey: string,
): Promise<number[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)

  try {
    const res = await geminiEmbed(text, { signal: controller.signal })

    if (!res.ok) {
      throw new Error(`Embedding failed with status ${res.status}`)
    }

    const data = await res.json()
    const values = data?.embedding?.values
    if (!Array.isArray(values)) {
      throw new Error('Embedding failed: no values in response')
    }
    return values as number[]
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Standard cosine similarity between two vectors.
 * Returns 0 for zero-length or mismatched vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Build a single text string for embedding from a node's fields.
 * Max 600 chars total — truncates detail if needed.
 */
export function buildEmbeddingText(
  node: Pick<LifeNode, 'category' | 'title' | 'detail' | 'tags' | 'people'>,
): string {
  const tagsStr = node.tags.length > 0 ? ` Tags: ${node.tags.join(', ')}.` : ''
  const peopleStr =
    node.people.length > 0 ? ` People: ${node.people.join(', ')}.` : ''
  const base = `${node.category}: ${node.title}. ${node.detail}.${tagsStr}${peopleStr}`
  return base.slice(0, 600)
}
