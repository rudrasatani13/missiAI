import type { ConversationEntry } from '@/types/chat'
import type { LifeNode, LifeGraph, MemoryCategory } from '@/types/memory'
import { geminiGenerate } from '@/lib/ai/providers/vertex-client'

const GEMINI_FLASH_MODEL = 'gemini-2.5-pro'
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
): Promise<ExtractedNode[]> {
  const recent = conversation.slice(-6)

  const convoText = recent
    .map((m) => `${m.role}: ${m.content}`)
    .join('\n')

  const systemPrompt = `You are a memory extraction engine. Analyze this conversation and extract ONLY genuinely important, lasting facts about the user's life.

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

STRICT RULES — FOLLOW PRECISELY:
1. Only extract facts with confidence >= 0.8
2. Maximum 2 nodes per conversation — ONLY the most significant ones
3. When in doubt, do NOT extract. Quality over quantity. Return [] if nothing important.
4. Prioritize: life goals, relationships, important events, strong preferences, skills, beliefs, habits
5. Keep titles UNIQUE and SPECIFIC — never use generic titles like "User's preference" or "User's goal"

NEVER EXTRACT (return [] instead):
- Greetings: "hi", "hello", "how are you", "what's up", "thanks", "bye", "good morning"
- Small talk: "the weather is nice", "I'm fine", "nothing much", casual chitchat
- Temporary states: "I'm tired right now", "I'm hungry", "I'm bored today"
- AI's own statements: only save facts about THE USER, never what the AI said
- Things said in passing: "maybe I'll try yoga someday" (too vague, not committed)
- Questions the user asked: "what is machine learning?" is NOT a memory
- Hypotheticals: "I might go to Paris" (not certain enough)
- One-time opinions: "that movie was ok" (too trivial)
- Redundant info: anything already in EXISTING MEMORIES below

ONLY EXTRACT things like:
- "I work as a software developer at Google" → YES (career fact)
- "My girlfriend's name is Priya" → YES (relationship)
- "I want to move to Canada next year" → YES (life goal)
- "I've been learning guitar for 6 months" → YES (skill/habit)
- "My mom's birthday is March 15" → YES (important personal fact)

EXISTING MEMORIES (do NOT duplicate these):
${existingGraph.nodes.slice(0, 30).map(n => '- ' + n.title + ': ' + n.detail.slice(0, 80)).join('\n') || '(none yet)'}`;

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS)

  try {
    const res = await geminiGenerate(
      GEMINI_FLASH_MODEL,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [
          { role: 'user', parts: [{ text: `CONVERSATION:\n${convoText}` }] },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      },
      { signal: controller.signal }
    )

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
          item.confidence >= 0.75 &&
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

    // Deduplicate against existing graph nodes — aggressive matching
    return validated.filter((newNode) => {
      const newTitleLower = newNode.title.toLowerCase().trim()
      const newDetailLower = newNode.detail.toLowerCase().trim()

      // Normalize: remove common filler words for comparison
      const normalize = (s: string) => s.replace(/\b(the|a|an|is|are|was|were|has|have|to|for|in|of|and|or|with|about|my|their|user\'s|user)\b/gi, '').replace(/\s+/g, ' ').trim()
      const newTitleNorm = normalize(newTitleLower)

      return !existingGraph.nodes.some((existing) => {
        const existingTitleLower = existing.title.toLowerCase().trim()
        const existingDetailLower = existing.detail.toLowerCase().trim()
        const existingTitleNorm = normalize(existingTitleLower)

        // Exact title match
        if (existingTitleLower === newTitleLower) return true
        // One title contains the other
        if (existingTitleLower.includes(newTitleLower) || newTitleLower.includes(existingTitleLower)) return true
        // Normalized title match
        if (existingTitleNorm === newTitleNorm && newTitleNorm.length > 3) return true
        // Detail overlap — if 60%+ of the new detail words exist in an existing detail
        const newWords = new Set(newDetailLower.split(/\s+/).filter(w => w.length > 3))
        const existingWords = new Set(existingDetailLower.split(/\s+/).filter(w => w.length > 3))
        if (newWords.size > 0) {
          let overlap = 0
          for (const w of newWords) { if (existingWords.has(w)) overlap++ }
          if (overlap / newWords.size > 0.6) return true
        }
        // Same category + similar subject keywords
        if (existing.category === newNode.category) {
          const existingKeywords = new Set([...existing.tags, ...existingTitleNorm.split(' ')].filter(w => w.length > 3))
          const newKeywords = [...newNode.tags, ...newTitleNorm.split(' ')].filter(w => w.length > 3)
          if (newKeywords.length > 0) {
            let keyOverlap = 0
            for (const k of newKeywords) { if (existingKeywords.has(k)) keyOverlap++ }
            if (keyOverlap / newKeywords.length > 0.5) return true
          }
        }
        return false
      })
    })
  } catch {
    // Parse failure or network error — return empty
    return []
  } finally {
    clearTimeout(timer)
  }
}
