import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateEveningReflection } from "@/lib/proactive/wind-down-generator"
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

describe("wind-down-generator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("generateEveningReflection", () => {
    it("should parse valid Gemini response into EveningReflection items", async () => {
      const mockItems = [
        {
          type: "daily_win",
          priority: "high",
          message: "You made great progress on your Spanish today!",
          actionable: false,
        },
        {
          type: "gratitude_prompt",
          priority: "medium",
          message: "What's one thing that made you smile today?",
          actionable: false,
        },
      ]

      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse(mockItems))

      const graph = makeGraph([makeNode()])
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.items).toHaveLength(2)
      expect(reflection.items[0].type).toBe("daily_win")
      expect(reflection.items[1].type).toBe("gratitude_prompt")
      expect(["calm", "reflective"]).toContain(reflection.tone)
      expect(reflection.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(reflection.generatedAt).toBeGreaterThan(0)
    })

    it("should return empty reflection when graph has no nodes", async () => {
      const reflection = await generateEveningReflection(
        makeGraph([]),
        DEFAULT_CONFIG,
      )

      expect(reflection.items).toHaveLength(0)
      expect(mockGeminiGenerate).not.toHaveBeenCalled()
    })

    it("should return empty reflection on Gemini API error", async () => {
      mockGeminiGenerate.mockRejectedValueOnce(new Error("Network error"))

      const graph = makeGraph([makeNode()])
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.items).toEqual([])
    })

    it("should cap messages at 120 chars", async () => {
      const longMessage = "A".repeat(200)
      mockGeminiGenerate.mockResolvedValueOnce(
        mockGeminiResponse([
          {
            type: "sleep_nudge",
            priority: "low",
            message: longMessage,
            actionable: false,
          },
        ]),
      )

      const graph = makeGraph([makeNode()])
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.items[0].message.length).toBeLessThanOrEqual(120)
    })

    it("should filter out invalid item types", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(
        mockGeminiResponse([
          { type: "unknown_type", priority: "high", message: "Invalid", actionable: false },
          { type: "daily_win", priority: "medium", message: "You did great today!", actionable: false },
        ]),
      )

      const graph = makeGraph([makeNode()])
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.items).toHaveLength(1)
      expect(reflection.items[0].type).toBe("daily_win")
    })

    it("should set tone to 'calm' for low emotional weight graph", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse([]))

      const nodes = [
        makeNode({ id: "n1", emotionalWeight: 0.2 }),
        makeNode({ id: "n2", emotionalWeight: 0.3 }),
        makeNode({ id: "n3", emotionalWeight: 0.4 }),
      ]
      const graph = makeGraph(nodes)
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.tone).toBe("calm")
    })

    it("should set tone to 'reflective' for high emotional weight graph", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(mockGeminiResponse([]))

      const nodes = [
        makeNode({ id: "n1", emotionalWeight: 0.8 }),
        makeNode({ id: "n2", emotionalWeight: 0.9 }),
        makeNode({ id: "n3", emotionalWeight: 0.85 }),
      ]
      const graph = makeGraph(nodes)
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.tone).toBe("reflective")
    })

    it("should return empty reflection when Gemini returns non-200 status", async () => {
      mockGeminiGenerate.mockResolvedValueOnce(
        new Response("Internal Server Error", { status: 500 }),
      )

      const graph = makeGraph([makeNode()])
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.items).toEqual([])
    })

    it("should handle markdown-wrapped JSON from Gemini", async () => {
      const items = [
        {
          type: "gratitude_prompt",
          priority: "medium",
          message: "What are you grateful for today?",
          actionable: false,
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
      const reflection = await generateEveningReflection(graph, DEFAULT_CONFIG)

      expect(reflection.items).toHaveLength(1)
      expect(reflection.items[0].type).toBe("gratitude_prompt")
    })
  })
})
