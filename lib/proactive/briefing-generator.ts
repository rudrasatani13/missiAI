import type { LifeGraph, LifeNode } from '@/types/memory'
import type { BriefingItem, DailyBriefing, ProactiveConfig } from '@/types/proactive'
import { geminiGenerate } from '@/lib/ai/vertex-client'

const GEMINI_MODEL = 'gemini-2.5-pro'
const BRIEFING_TIMEOUT_MS = 15_000
const MAX_CONTEXT_CHARS = 2000

const SYSTEM_PROMPT = `You are a caring personal AI assistant generating a morning briefing.
Based on what you know about this person, generate 3-5 short, warm, actionable briefing items.
Return ONLY valid JSON array. No markdown. No explanation.
Each item: { type, priority, message, actionable }
type must be one of: goal_nudge | relationship_reminder | habit_check | calendar_prep | memory_insight | weather_heads_up | task_followup
priority must be one of: high | medium | low
message must be under 120 chars and conversational in tone.
actionable is a boolean.
Focus on: goals they haven't mentioned recently, people they should reach out to, habits to check in on, tasks to follow up.
Tone: warm, like a trusted friend who knows your life well.`

/**
 * Build a context string from the top 10 most relevant nodes (max 2000 chars).
 */
function buildContext(graph: LifeGraph): string {
  if (graph.nodes.length === 0) return ''

  // Sort by emotional weight descending, take top 10
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
 * Determine the tone of the briefing based on the emotional context of the graph.
 * - avg emotionalWeight > 0.7 → 'energetic'
 * - majority of nodes are goals → 'focused'
 * - default → 'calm'
 */
function determineTone(graph: LifeGraph): DailyBriefing['tone'] {
  if (graph.nodes.length === 0) return 'calm'

  const avgWeight =
    graph.nodes.reduce((sum, n) => sum + n.emotionalWeight, 0) /
    graph.nodes.length

  if (avgWeight > 0.7) return 'energetic'

  const goalCount = graph.nodes.filter((n) => n.category === 'goal').length
  if (goalCount > graph.nodes.length / 2) return 'focused'

  return 'calm'
}

/**
 * Assign nodeIds to briefing items by keyword-matching the item message
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
 * Generate a daily morning briefing for the user using Gemini.
 * Falls back to an empty briefing on any error.
 */
export async function generateDailyBriefing(
  graph: LifeGraph,
  config: ProactiveConfig,
): Promise<DailyBriefing> {
  const date = new Date().toISOString().slice(0, 10)
  const tone = determineTone(graph)

  const emptyBriefing: DailyBriefing = {
    userId: '',
    date,
    items: [],
    generatedAt: Date.now(),
    tone,
  }

  // No nodes → skip AI call
  if (graph.nodes.length === 0 || !apiKey) return emptyBriefing

  const context = buildContext(graph)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BRIEFING_TIMEOUT_MS)

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

    if (!res.ok) return emptyBriefing

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
    if (!Array.isArray(parsed)) return emptyBriefing

    const validTypes = new Set([
      'goal_nudge',
      'relationship_reminder',
      'habit_check',
      'calendar_prep',
      'memory_insight',
      'weather_heads_up',
      'task_followup',
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
      .slice(0, config.maxItemsPerBriefing)
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
    return emptyBriefing
  } finally {
    clearTimeout(timer)
  }
}
