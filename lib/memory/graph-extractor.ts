import type { ConversationEntry } from '@/types/chat'
import type { LifeNode, LifeGraph, MemoryCategory } from '@/types/memory'

const GEMINI_FLASH_MODEL = 'gemini-2.0-flash-lite'
const EXTRACTION_TIMEOUT_MS = 15_000

const VALID_CATEGORIES: MemoryCategory[] = [
  'person',
  'goal',
  'habit',
  'preference',
  'event',
  'emotion',
  'skill',
  'place',
  'belief',
  'relationship',
]

type ExtractedNode = Omit<
  LifeNode,
  'id' | 'userId' | 'createdAt' | 'updatedAt' | 'accessCount' | 'lastAccessedAt'
>

/**
 * Use Gemini Flash to extract structured life nodes from the last 6 messages.
 * Deduplicates against existing graph nodes by title similarity.
 * Returns [] on any failure (network, parse, etc.).
 */
export async function extractLifeNodes(
  conversation: ConversationEntry[],
  existingGraph: LifeGraph,
  apiKey: string,
): Promise<ExtractedNode[]> {
  const recent = conversation.slice(-6)

  const convoText = recent
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const systemPrompt = `Analyze this conversation and extract facts about the user's life.
Return ONLY a valid JSON array. No markdown. No explanation.
Each item must have exactly these fields:
category (one of: person|goal|habit|preference|event|emotion|skill|place|belief|relationship),
title (max 80 chars, specific and descriptive),
detail (max 500 chars, rich context with nuance),
tags (array of max 8 lowercase topic strings),
people (array of first names mentioned, empty if none),
emotionalWeight (0.0-1.0),
confidence (0.0-1.0),
source: "conversation"
Only extract facts with confidence >= 0.6.
Skip generic small talk. Focus on lasting facts about the person.`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          { role: 'user', parts: [{ text: `CONVERSATION:\n${convoText}` }] },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      console.error(`Life node extraction Gemini error ${res.status}`)
      return []
    }

    const data = await res.json()
    const rawText: string =
      data?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => typeof p.text === 'string')
        .map((p: any) => p.text)
        .join('') ?? ''

    // Strip markdown fences if model wraps output
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return []

    const validated: ExtractedNode[] = parsed
      .filter(
        (item: any) =>
          typeof item.title === 'string' &&
          typeof item.detail === 'string' &&
          typeof item.confidence === 'number' &&
          item.confidence >= 0.6 &&
          VALID_CATEGORIES.includes(item.category),
      )
      .map((item: any) => ({
        userId: '',
        category: item.category as MemoryCategory,
        title: String(item.title).slice(0, 80),
        detail: String(item.detail).slice(0, 500),
        tags: (Array.isArray(item.tags) ? item.tags : [])
          .slice(0, 8)
          .map(String),
        people: (Array.isArray(item.people) ? item.people : []).map(String),
        emotionalWeight: Math.max(
          0,
          Math.min(1, Number(item.emotionalWeight) || 0.5),
        ),
        confidence: Math.max(0, Math.min(1, Number(item.confidence))),
        source: 'conversation' as const,
      }))

    // Deduplicate against existing graph nodes by title similarity
    return validated.filter((newNode) => {
      const newTitleLower = newNode.title.toLowerCase()
      return !existingGraph.nodes.some((existing) => {
        const existingLower = existing.title.toLowerCase()
        return (
          existingLower === newTitleLower ||
          existingLower.includes(newTitleLower) ||
          newTitleLower.includes(existingLower)
        )
      })
    })
  } catch {
    // Parse failure or network error — return empty
    return []
  } finally {
    clearTimeout(timer)
  }
}
