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

  // ── GOAL NUDGE: goal node not accessed in > 3 days ───────────────────────
  for (const node of graph.nodes) {
    if (node.category !== 'goal') continue
    if (now - node.lastAccessedAt <= 3 * DAY_MS) continue
    if (isDismissed('goal_nudge', node.id)) continue
    nudges.push({
      type: 'goal_nudge',
      priority: 'high',
      actionable: true,
      message: `Still working on ${node.title}? Let's check in.`,
      nodeId: node.id,
    })
  }

  // ── RELATIONSHIP REMINDER: person/relationship not accessed in > 7 days ──
  for (const node of graph.nodes) {
    if (node.category !== 'person' && node.category !== 'relationship') continue
    if (now - node.lastAccessedAt <= 7 * DAY_MS) continue
    if (node.emotionalWeight <= 0.5) continue
    if (isDismissed('relationship_reminder', node.id)) continue
    const lowerTitle = node.title.trim().toLowerCase()
    const reminderTarget = lowerTitle === "user's name" ? 'your name' : node.title
    nudges.push({
      type: 'relationship_reminder',
      priority: 'medium',
      actionable: true,
      message: `You haven't talked about ${reminderTarget} in a while.`,
      nodeId: node.id,
    })
  }

  // ── HABIT CHECK: any habit node, if last interaction was > 20 hours ago ──
  if (now - lastInteractionAt > 20 * HOUR_MS) {
    for (const node of graph.nodes) {
      if (node.category !== 'habit') continue
      if (isDismissed('habit_check', node.id)) continue
      nudges.push({
        type: 'habit_check',
        priority: 'low',
        actionable: true,
        message: `How's your ${node.title} habit going today?`,
        nodeId: node.id,
      })
    }
  }

  // ── MEMORY INSIGHT: cluster of 3+ nodes sharing the same tag ────────────
  if (graph.nodes.length >= 10) {
    const tagCounts = new Map<string, number>()
    for (const node of graph.nodes) {
      for (const tag of node.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }
    for (const [tag, count] of tagCounts.entries()) {
      if (count >= 3 && !isDismissed('memory_insight', undefined)) {
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
