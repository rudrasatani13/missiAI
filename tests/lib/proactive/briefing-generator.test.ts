import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateDailyBriefing } from "@/lib/proactive/briefing-generator"
import type { LifeGraph, LifeNode } from "@/types/memory"
import type { ProactiveConfig } from "@/types/proactive"

// Mock vertex-client to avoid real Vertex AI auth in tests
vi.mock("@/lib/ai/vertex-client", () => ({
  geminiGenerate: vi.fn(),
}))

import { geminiGenerate } from "@/lib/ai/vertex-client"
const mockGeminiGenerate = vi.mocked(geminiGenerate)

const DAY_MS = 24 * 60 * 60 * 1000

const DEFAULT_CONFIG: ProactiveConfig = {
  enabled: true,
  briefingTime: "08:00",
  timezone: "UTC",
  nudgesEnabled: true,
  maxItemsPerBriefing: 5,
  windDownEnabled: false,
  windDownTime: "22:00",
}

function makeNode(overrides: Partial<LifeNode> = {}): LifeNode {
  return {
    id: "node-1",
    userId: "user-123",
    category: "goal",
    title: "Learn Spanish",
    detail: "Want to be conversational by year end",
    tags: ["language", "learning"],
    people: [],
    emotionalWeight: 0.5,
    confidence: 0.9,
    createdAt: Date.now() - 10 * DAY_MS,
    updatedAt: Date.now() - 2 * DAY_MS,
    accessCount: 3,
    lastAccessedAt: Date.now() - 5 * DAY_MS,
    source: "conversation",
    ...overrides,
  }
}

function makeGraph(nodes: LifeNode[]): LifeGraph {
  return {
    nodes,
    totalInteractions: 20,
    lastUpdatedAt: Date.now() - DAY_MS,
    version: 5,
  }
}

function mockGeminiResponse(items: object[]) {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(items) }],
          },
        },
      ],
    }),
    { status: 200 },
  )
}

describe("briefing-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("generateDailyBriefing", () => {
    it("should parse a valid Gemini response into BriefingItems", async () => {
      const mockItems = [
        {
          type: "goal_nudge",
          priority: "high",
          message: "Still working on Learn Spanish? Let's check in.",
          actionable: true,
        },
        {
          type: "habit_check",
          priority: "low",
          message: "How's your daily meditation habit going today?",
          actionable: true,
        },
      ]

      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse(mockItems))

      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items).toHaveLength(2)
      expect(briefing.items[0].type).toBe("goal_nudge")
      expect(briefing.items[0].priority).toBe("high")
      expect(briefing.items[0].message).toBe(
        "Still working on Learn Spanish? Let's check in.",
      )
      expect(briefing.items[0].actionable).toBe(true)
      expect(briefing.items[1].type).toBe("habit_check")
      expect(briefing.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(briefing.generatedAt).toBeGreaterThan(0)
    })

    it("should return briefing with [] items when Gemini returns invalid JSON", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: "this is not json at all {{{{" }] } }],
          }),
          { status: 200 },
        ),
      )

      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items).toEqual([])
    })

    it("should return briefing with [] items when Gemini returns a non-array", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ not: "an array" }) }] } }],
          }),
          { status: 200 },
        ),
      )

      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items).toEqual([])
    })

    it("should return briefing with [] items for an empty graph (no Gemini call)", async () => {
      const briefing = await generateDailyBriefing(
        makeGraph([]),
        DEFAULT_CONFIG,
      )

      expect(briefing.items).toEqual([])
      // Gemini should NOT be called for an empty graph
      expect(mockGeminiGenerate).not.toHaveBeenCalled()
    })

    it("should return briefing with [] items when Gemini API returns an error", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      )

      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items).toEqual([])
    })

    it("should handle markdown-wrapped JSON from Gemini", async () => {
      const items = [
        {
          type: "goal_nudge",
          priority: "high",
          message: "Check in on your goals!",
          actionable: true,
        },
      ]
      mockGeminiGenerate.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [{ text: "```json\n" + JSON.stringify(items) + "\n```" }],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )

      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items).toHaveLength(1)
      expect(briefing.items[0].type).toBe("goal_nudge")
    })

    it("should respect maxItemsPerBriefing from config", async () => {
      const tenItems = Array.from({ length: 10 }, (_, i) => ({
        type: "goal_nudge",
        priority: "high",
        message: `Goal nudge number ${i}`,
        actionable: true,
      }))
      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse(tenItems))

      const config = { ...DEFAULT_CONFIG, maxItemsPerBriefing: 3 }
      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, config)

      expect(briefing.items.length).toBeLessThanOrEqual(3)
    })

    it("should truncate messages longer than 120 chars", async () => {
      const longMessage = "A".repeat(200)
      mockGeminiGenerate.mockResolvedValueOnce(
        mockGeminiResponse([
          {
            type: "goal_nudge",
            priority: "high",
            message: longMessage,
            actionable: true,
          },
        ]),
      )

      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items[0].message.length).toBeLessThanOrEqual(120)
    })

    it("should filter out items with invalid types", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(
        mockGeminiResponse([
          { type: "unknown_type", priority: "high", message: "Hello", actionable: true },
          { type: "goal_nudge", priority: "high", message: "Valid item", actionable: true },
        ]),
      )

      const graph = makeGraph([makeNode()])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items).toHaveLength(1)
      expect(briefing.items[0].type).toBe("goal_nudge")
    })

    it("should assign nodeId by keyword matching message to node title", async () => {
      const node = makeNode({ id: "spanish-goal", title: "Spanish" })
      mockGeminiGenerate.mockResolvedValueOnce(
        mockGeminiResponse([
          {
            type: "goal_nudge",
            priority: "high",
            message: "How is your Spanish goal progressing?",
            actionable: true,
          },
        ]),
      )

      const graph = makeGraph([node])
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.items[0].nodeId).toBe("spanish-goal")
    })
  })

  describe("tone calculation", () => {
    it("should return 'energetic' tone when avg emotionalWeight > 0.7", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse([]))

      const nodes = [
        makeNode({ id: "n1", emotionalWeight: 0.8 }),
        makeNode({ id: "n2", emotionalWeight: 0.9 }),
        makeNode({ id: "n3", emotionalWeight: 0.75 }),
      ]
      const graph = makeGraph(nodes)
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.tone).toBe("energetic")
    })

    it("should return 'focused' tone when majority of nodes are goals", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse([]))

      const nodes = [
        makeNode({ id: "g1", category: "goal", emotionalWeight: 0.4 }),
        makeNode({ id: "g2", category: "goal", emotionalWeight: 0.4 }),
        makeNode({ id: "g3", category: "goal", emotionalWeight: 0.4 }),
        makeNode({ id: "p1", category: "person", emotionalWeight: 0.3 }),
      ]
      const graph = makeGraph(nodes)
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.tone).toBe("focused")
    })

    it("should return 'calm' tone by default (mixed nodes, low emotional weight)", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse([]))

      const nodes = [
        makeNode({ id: "g1", category: "goal", emotionalWeight: 0.3 }),
        makeNode({ id: "p1", category: "person", emotionalWeight: 0.3 }),
        makeNode({ id: "h1", category: "habit", emotionalWeight: 0.3 }),
      ]
      const graph = makeGraph(nodes)
      const briefing = await generateDailyBriefing(graph, DEFAULT_CONFIG)

      expect(briefing.tone).toBe("calm")
    })

    it("should return 'calm' tone for empty graph", async () => {
      const briefing = await generateDailyBriefing(
        makeGraph([]),
        DEFAULT_CONFIG,
      )
      expect(briefing.tone).toBe("calm")
    })
  })
})
