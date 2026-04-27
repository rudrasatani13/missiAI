import { describe, it, expect } from "vitest"
import { checkForNudges } from "@/lib/proactive/nudge-engine"
import type { LifeGraph, LifeNode } from "@/types/memory"
import type { BriefingItem } from "@/types/proactive"

const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

function makeNode(overrides: Partial<LifeNode> = {}): LifeNode {
  return {
    id: "node-1",
    userId: "user-123",
    category: "goal",
    title: "Learn Spanish",
    detail: "Want to be conversational by year end",
    tags: ["language", "learning"],
    people: [],
    emotionalWeight: 0.8,
    confidence: 0.9,
    createdAt: Date.now() - 10 * DAY_MS,
    updatedAt: Date.now() - 4 * DAY_MS,
    accessCount: 3,
    lastAccessedAt: Date.now() - 4 * DAY_MS,
    source: "conversation",
    ...overrides,
  }
}

function makeGraph(nodes: LifeNode[]): LifeGraph {
  return {
    nodes,
    totalInteractions: 10,
    lastUpdatedAt: Date.now() - DAY_MS,
    version: 3,
  }
}

describe("nudge-engine", () => {
  describe("goal_nudge", () => {
    it("should return goal_nudge for a goal node not accessed in > 3 days", () => {
      const node = makeNode({
        category: "goal",
        lastAccessedAt: Date.now() - 4 * DAY_MS,
      })
      const result = checkForNudges(makeGraph([node]), Date.now())

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe("goal_nudge")
      expect(result[0].priority).toBe("high")
      expect(result[0].actionable).toBe(true)
      expect(result[0].nodeId).toBe(node.id)
      expect(result[0].message).toContain(node.title)
      expect(result[0].message.length).toBeLessThanOrEqual(120)
    })

    it("should NOT return goal_nudge for a goal node accessed within 3 days", () => {
      const node = makeNode({
        category: "goal",
        lastAccessedAt: Date.now() - 2 * DAY_MS,
      })
      const result = checkForNudges(makeGraph([node]), Date.now())
      expect(result.filter((n) => n.type === "goal_nudge")).toHaveLength(0)
    })
  })

  describe("relationship_reminder", () => {
    it("should return relationship_reminder for person node not accessed in > 7 days with emotionalWeight > 0.5", () => {
      const node = makeNode({
        id: "person-1",
        category: "person",
        title: "Sarah",
        lastAccessedAt: Date.now() - 8 * DAY_MS,
        emotionalWeight: 0.7,
      })
      const result = checkForNudges(makeGraph([node]), Date.now())

      expect(result).toHaveLength(1)
      expect(result[0].type).toBe("relationship_reminder")
      expect(result[0].priority).toBe("medium")
      expect(result[0].actionable).toBe(true)
      expect(result[0].nodeId).toBe(node.id)
      expect(result[0].message).toContain(node.title)
    })

    it("should NOT return reminder for person node with low emotional weight", () => {
      const node = makeNode({
        category: "person",
        lastAccessedAt: Date.now() - 8 * DAY_MS,
        emotionalWeight: 0.3,
      })
      const result = checkForNudges(makeGraph([node]), Date.now())
      expect(result.filter((n) => n.type === "relationship_reminder")).toHaveLength(0)
    })

    it("should NOT return reminder for person node accessed within 7 days", () => {
      const node = makeNode({
        category: "person",
        lastAccessedAt: Date.now() - 6 * DAY_MS,
        emotionalWeight: 0.8,
      })
      const result = checkForNudges(makeGraph([node]), Date.now())
      expect(result.filter((n) => n.type === "relationship_reminder")).toHaveLength(0)
    })
  })

  describe("habit_check", () => {
    it("should return habit_check when lastInteractionAt > 20 hours ago", () => {
      const node = makeNode({
        id: "habit-1",
        category: "habit",
        title: "Daily meditation",
        lastAccessedAt: 0,
      })
      const lastInteractionAt = Date.now() - 21 * HOUR_MS
      const result = checkForNudges(makeGraph([node]), lastInteractionAt)

      expect(result.some((n) => n.type === "habit_check")).toBe(true)
      const habitNudge = result.find((n) => n.type === "habit_check")!
      expect(habitNudge.message).toContain(node.title)
      expect(habitNudge.priority).toBe("low")
      expect(habitNudge.actionable).toBe(true)
    })

    it("should NOT return habit_check when lastInteractionAt is recent (< 20 hrs)", () => {
      const node = makeNode({
        category: "habit",
        title: "Daily meditation",
        lastAccessedAt: 0,
      })
      const lastInteractionAt = Date.now() - 1 * HOUR_MS
      const result = checkForNudges(makeGraph([node]), lastInteractionAt)
      expect(result.filter((n) => n.type === "habit_check")).toHaveLength(0)
    })
  })

  describe("dismissed items", () => {
    it("should NOT return a nudge for a node dismissed within 24 hours", () => {
      const node = makeNode({
        category: "goal",
        lastAccessedAt: Date.now() - 4 * DAY_MS,
      })
      const existingItems: Pick<BriefingItem, "type" | "nodeId" | "dismissedAt">[] = [
        {
          type: "goal_nudge",
          nodeId: node.id,
          dismissedAt: Date.now() - 1000, // dismissed 1 second ago
        },
      ]
      const result = checkForNudges(makeGraph([node]), Date.now(), existingItems)
      expect(result.filter((n) => n.type === "goal_nudge")).toHaveLength(0)
    })

    it("should RETURN a nudge for a node dismissed more than 24 hours ago", () => {
      const node = makeNode({
        category: "goal",
        lastAccessedAt: Date.now() - 4 * DAY_MS,
      })
      const existingItems: Pick<BriefingItem, "type" | "nodeId" | "dismissedAt">[] = [
        {
          type: "goal_nudge",
          nodeId: node.id,
          dismissedAt: Date.now() - 25 * HOUR_MS, // dismissed over 24h ago
        },
      ]
      const result = checkForNudges(makeGraph([node]), Date.now(), existingItems)
      expect(result.filter((n) => n.type === "goal_nudge")).toHaveLength(1)
    })
  })

  describe("max 3 nudges", () => {
    it("should return at most 3 nudges even if more qualify", () => {
      // 5 qualifying goal nodes
      const nodes: LifeNode[] = Array.from({ length: 5 }, (_, i) =>
        makeNode({
          id: `goal-${i}`,
          category: "goal",
          title: `Goal ${i}`,
          lastAccessedAt: Date.now() - 5 * DAY_MS,
        }),
      )
      const result = checkForNudges(makeGraph(nodes), Date.now())
      expect(result.length).toBe(3)
    })

    it("should sort by priority — high comes first", () => {
      const goalNode = makeNode({
        id: "g1",
        category: "goal",
        lastAccessedAt: Date.now() - 4 * DAY_MS,
      })
      const personNode = makeNode({
        id: "p1",
        category: "person",
        title: "Alice",
        lastAccessedAt: Date.now() - 8 * DAY_MS,
        emotionalWeight: 0.8,
      })
      const habitNode = makeNode({
        id: "h1",
        category: "habit",
        title: "Journaling",
        lastAccessedAt: 0,
      })

      const lastInteractionAt = Date.now() - 21 * HOUR_MS
      const result = checkForNudges(
        makeGraph([goalNode, personNode, habitNode]),
        lastInteractionAt,
      )

      expect(result[0].priority).toBe("high")
      if (result.length > 1) {
        expect(["high", "medium"].includes(result[1].priority)).toBe(true)
      }
    })
  })

  describe("empty graph", () => {
    it("should return [] for an empty graph", () => {
      const result = checkForNudges(makeGraph([]), Date.now())
      expect(result).toEqual([])
    })
  })

  describe("memory_insight", () => {
    it("should return memory_insight when 3+ nodes share the same tag and graph has >= 10 nodes", () => {
      const nodes = Array.from({ length: 10 }, (_, i) =>
        makeNode({
          id: `node-${i}`,
          category: "skill",
          title: `Skill ${i}`,
          tags: i < 4 ? ["fitness"] : ["other"],
          lastAccessedAt: Date.now() - DAY_MS,
        }),
      )
      const result = checkForNudges(
        makeGraph(nodes),
        Date.now() - 21 * HOUR_MS,
      )
      expect(result.some((n) => n.type === "memory_insight")).toBe(true)
      const insight = result.find((n) => n.type === "memory_insight")!
      expect(insight.message).toContain("fitness")
      expect(insight.actionable).toBe(false)
      expect(insight.priority).toBe("low")
    })

    it("should NOT return memory_insight if graph has fewer than 10 nodes", () => {
      const nodes = Array.from({ length: 5 }, (_, i) =>
        makeNode({
          id: `node-${i}`,
          category: "skill",
          title: `Skill ${i}`,
          tags: ["fitness"],
          lastAccessedAt: Date.now() - DAY_MS,
        }),
      )
      const result = checkForNudges(makeGraph(nodes), Date.now())
      expect(result.filter((n) => n.type === "memory_insight")).toHaveLength(0)
    })
  })
})
