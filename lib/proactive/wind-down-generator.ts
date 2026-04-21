import type { LifeGraph } from '@/types/memory'
import type { BriefingItem, EveningReflection, ProactiveConfig } from '@/types/proactive'
import { geminiGenerate } from '@/lib/ai/vertex-client'

const GEMINI_MODEL = 'gemini-2.5-pro'
const WIND_DOWN_TIMEOUT_MS = 15_000
const MAX_CONTEXT_CHARS = 2000

const SYSTEM_PROMPT = `You are a warm, calming personal AI assistant generating an evening wind-down reflection. Based on what you know about this person, generate 3-5 short, gentle items to help them reflect on their day and prepare for peaceful sleep.
Return ONLY valid JSON array. No markdown. No explanation.
Each item: { type, priority, message, actionable }
type must be one of: daily_win | tomorrow_prep | gratitude_prompt | sleep_nudge | habit_check | goal_nudge
priority must be one of: high | medium | low
message must be under 120 chars, warm and calming in tone.
actionable is a boolean.
Focus on: celebrating small wins today, one gentle nudge about tomorrow, something to feel grateful for, a sleep-friendly closing thought.
Tone: calm, like a trusted friend wishing you goodnight.
Never create anxiety. Never use urgent language.`

/**
 * Build a context string from the top 10 most relevant nodes (max 2000 chars).
 */
function buildContext(graph: LifeGraph): string {
  if (graph.nodes.length === 0) return ''

  const top10 = [...graph.nodes]
    .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
    .slice(0, 10)

  const lines = top10.map(
    (n) => `${n.category.toUpperCase()}: ${n.title} — ${n.detail}`,
  )

  let context = lines.join('\n')
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.slice(0, MAX_CONTEXT_CHARS)
  }
  return context
}

/**
 * Determine the tone of the evening reflection.
 * - avg emotionalWeight <= 0.6 → 'calm'
 * - default → 'reflective'
 */
function determineTone(graph: LifeGraph): EveningReflection['tone'] {
  if (graph.nodes.length === 0) return 'calm'

  const avgWeight =
    graph.nodes.reduce((sum, n) => sum + n.emotionalWeight, 0) /
    graph.nodes.length

  return avgWeight <= 0.6 ? 'calm' : 'reflective'
}

/**
 * Assign nodeIds to reflection items by keyword-matching the item message
 * against node titles in the graph.
 */
function assignNodeIds(items: BriefingItem[], graph: LifeGraph): BriefingItem[] {
  return items.map((item) => {
    if (item.nodeId) return item
    const messageLower = item.message.toLowerCase()
    const matched = graph.nodes.find((node) =>
      messageLower.includes(node.title.toLowerCase()),
    )
    return matched ? { ...item, nodeId: matched.id } : item
  })
}

/**
 * Generate an evening wind-down reflection for the user using Gemini.
 * Falls back to an empty reflection on any error.
 */
export async function generateEveningReflection(
  graph: LifeGraph,
  _config: ProactiveConfig,
): Promise<EveningReflection> {
  const date = new Date().toISOString().slice(0, 10)
  const tone = determineTone(graph)

  const emptyReflection: EveningReflection = {
    userId: '',
    date,
    items: [],
    generatedAt: Date.now(),
    tone,
  }

  // No nodes or no API key → skip AI call
  if (graph.nodes.length === 0) return emptyReflection

  const context = buildContext(graph)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), WIND_DOWN_TIMEOUT_MS)

  try {
    const res = await geminiGenerate(
      GEMINI_MODEL,
      {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: 'user',
            parts: [{ text: `LIFE CONTEXT:\n${context}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
        },
      },
      { signal: controller.signal }
    )

    if (!res.ok) return emptyReflection

    const data = await res.json()
    const rawText: string =
      data?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => typeof p.text === 'string')
        .map((p: any) => p.text as string)
        .join('') ?? ''

    // Strip markdown fences
    const cleaned = rawText
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim()

    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed)) return emptyReflection

    const validTypes = new Set([
      'daily_win',
      'tomorrow_prep',
      'gratitude_prompt',
      'sleep_nudge',
      'habit_check',
      'goal_nudge',
    ])
    const validPriorities = new Set(['high', 'medium', 'low'])

    const items: BriefingItem[] = parsed
      .filter(
        (item: any) =>
          typeof item.type === 'string' &&
          validTypes.has(item.type) &&
          typeof item.priority === 'string' &&
          validPriorities.has(item.priority) &&
          typeof item.message === 'string' &&
          item.message.length > 0,
      )
      .slice(0, 5)
      .map((item: any) => ({
        type: item.type as BriefingItem['type'],
        priority: item.priority as BriefingItem['priority'],
        message: String(item.message).slice(0, 120),
        actionable: Boolean(item.actionable),
      }))

    const withNodeIds = assignNodeIds(items, graph)

    return {
      userId: '',
      date,
      items: withNodeIds,
      generatedAt: Date.now(),
      tone,
    }
  } catch {
    return emptyReflection
  } finally {
    clearTimeout(timer)
  }
}
