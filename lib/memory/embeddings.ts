import type { LifeNode } from '@/types/memory'
import { geminiEmbed } from '@/lib/ai/providers/vertex-client'
import { logError } from '@/lib/server/observability/logger'

const EMBEDDING_TIMEOUT_MS = 10_000
const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings'

/**
 * Fallback to OpenAI text-embedding-3-small with 768-dimension parity.
 * OpenAI supports custom dimensions (1-1536) so we request 768 to match
 * Gemini text-embedding-004 output size. This keeps cosine similarity and
 * Vectorize index dimensions compatible.
 */
async function openaiEmbedFallback(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)

  try {
    const res = await fetch(OPENAI_EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: 'text-embedding-3-small',
        dimensions: 768,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`OpenAI embedding failed ${res.status}: ${errText}`)
    }

    const data = await res.json()
    const values = data?.data?.[0]?.embedding
    if (!Array.isArray(values) || values.length !== 768) {
      throw new Error(`OpenAI embedding returned invalid dimensions: ${values?.length}`)
    }
    return values as number[]
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Generate a 768-dimension embedding via Gemini text-embedding-004.
 * Automatically routes through Vertex AI or Google AI Studio based on
 * the AI_BACKEND environment variable.
 *
 * Falls back to OpenAI text-embedding-3-small (768-dim) on Vertex failure
 * so that vector writes remain available during outages.
 */
export async function generateEmbedding(
  text: string,
): Promise<number[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS)

  try {
    const res = await geminiEmbed(text, { signal: controller.signal })

    if (res.ok) {
      const data = await res.json()
      const values = data?.embedding?.values
      if (Array.isArray(values)) {
        return values as number[]
      }
      throw new Error('Embedding failed: no values in response')
    }

    // Vertex failed — attempt OpenAI fallback if key is present
    if (process.env.OPENAI_API_KEY) {
      logError('embedding.vertex_fallback', `Vertex ${res.status}, trying OpenAI`)
      return openaiEmbedFallback(text)
    }

    throw new Error(`Embedding failed with status ${res.status}`)
  } catch (err) {
    // Network/timeout/abort errors also trigger fallback
    if (process.env.OPENAI_API_KEY) {
      logError('embedding.vertex_error_fallback', err instanceof Error ? err.message : String(err))
      return openaiEmbedFallback(text)
    }
    throw err
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
