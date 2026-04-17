import type { LifeGraph } from '@/types/memory'
import type { BriefingItem } from '@/types/proactive'

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/**
 * Deterministic, zero-API nudge engine.
 * Inspects the Life Graph and returns up to 3 actionable nudges, sorted
 * high → medium → low priority.
 *
 * @param graph           The user's full Life Graph
 * @param lastInteractionAt  Unix ms timestamp of the user's last app interaction
 * @param existingItems   Previously generated BriefingItems (used to filter
 *                        items dismissed within the last 24 hours)
 */
export function checkForNudges(
  graph: LifeGraph,
  lastInteractionAt: number,
  existingItems?: Pick<BriefingItem, 'type' | 'nodeId' | 'dismissedAt'>[],
): BriefingItem[] {
  const now = Date.now()
  const nudges: BriefingItem[] = []

  // Build a quick lookup of dismissed node+type pairs (dismissed within 24 hrs)
  const dismissedSet = new Set<string>()
  if (existingItems) {
    for (const item of existingItems) {
      if (item.dismissedAt && now - item.dismissedAt < DAY_MS) {
        dismissedSet.add(`${item.type}:${item.nodeId ?? ''}`)
      }
    }
  }

  const isDismissed = (type: string, nodeId?: string) =>
    dismissedSet.has(`${type}:${nodeId ?? ''}`)

  const checkHabits = now - lastInteractionAt > 20 * HOUR_MS
  const checkInsights = graph.nodes.length >= 10 && !isDismissed('memory_insight', undefined)
  const tagCounts = checkInsights ? new Map<string, number>() : null

  for (const node of graph.nodes) {
    const { category, lastAccessedAt, id, title, emotionalWeight, tags } = node

    // ── GOAL NUDGE: goal node not accessed in > 3 days ───────────────────────
    if (category === 'goal') {
      if (now - lastAccessedAt > 3 * DAY_MS && !isDismissed('goal_nudge', id)) {
        nudges.push({
          type: 'goal_nudge',
          priority: 'high',
          actionable: true,
          message: `Still working on ${title}? Let's check in.`,
          nodeId: id,
        })
      }
    }
    // ── RELATIONSHIP REMINDER: person/relationship not accessed in > 7 days ──
    else if (category === 'person' || category === 'relationship') {
      if (
        now - lastAccessedAt > 7 * DAY_MS &&
        emotionalWeight > 0.5 &&
        !isDismissed('relationship_reminder', id)
      ) {
        nudges.push({
          type: 'relationship_reminder',
          priority: 'medium',
          actionable: true,
          message: `You haven't talked about ${title} in a while.`,
          nodeId: id,
        })
      }
    }
    // ── HABIT CHECK: any habit node, if last interaction was > 20 hours ago ──
    else if (category === 'habit' && checkHabits) {
      if (!isDismissed('habit_check', id)) {
        nudges.push({
          type: 'habit_check',
          priority: 'low',
          actionable: true,
          message: `How's your ${title} habit going today?`,
          nodeId: id,
        })
      }
    }

    // ── ACCUMULATE TAGS FOR MEMORY INSIGHT ──────────────────────────────────
    if (tagCounts) {
      for (const tag of tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }
  }

  // ── MEMORY INSIGHT: cluster of 3+ nodes sharing the same tag ────────────
  if (tagCounts) {
    for (const [tag, count] of tagCounts.entries()) {
      if (count >= 3) {
        nudges.push({
          type: 'memory_insight',
          priority: 'low',
          actionable: false,
          message: `I've noticed ${tag} comes up a lot for you lately.`,
        })
        break // Only one insight per check
      }
    }
  }

  // Sort: high → medium → low
  const ORDER = { high: 0, medium: 1, low: 2 }
  nudges.sort((a, b) => ORDER[a.priority] - ORDER[b.priority])

  // Max 3 nudges
  return nudges.slice(0, 3)
}
