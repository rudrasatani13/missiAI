import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateEmbedding, cosineSimilarity, buildEmbeddingText } from "@/lib/memory/embeddings"
import type { LifeNode } from "@/types/memory"

// Mock vertex-client so we can control geminiEmbed without real Vertex AI auth
vi.mock("@/lib/ai/providers/vertex-client", () => ({
  geminiEmbed: vi.fn(),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: vi.fn(),
}))

import { geminiEmbed } from "@/lib/ai/providers/vertex-client"
const mockGeminiEmbed = vi.mocked(geminiEmbed)

describe("embeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete (process.env as any).OPENAI_API_KEY
  })

  describe("generateEmbedding", () => {
    it("should generate embedding from Gemini API", async () => {
      const mockResponse = {
        embedding: {
          values: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      }

      mockGeminiEmbed.mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await generateEmbedding("test text")

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
      expect(mockGeminiEmbed).toHaveBeenCalledWith(
        "test text",
        expect.any(Object)
      )
    })

    it("should throw error on API failure when no OpenAI key", async () => {
      mockGeminiEmbed.mockResolvedValueOnce(
        new Response("Error", { status: 500 })
      )

      await expect(generateEmbedding("test")).rejects.toThrow(
        "Embedding failed with status 500"
      )
    })

    it("should throw error on invalid response when no OpenAI key", async () => {
      mockGeminiEmbed.mockResolvedValueOnce(
        new Response(JSON.stringify({ invalid: "response" }), { status: 200 })
      )

      await expect(generateEmbedding("test")).rejects.toThrow(
        "Embedding failed: no values in response"
      )
    })

    it("should handle timeout when no OpenAI key", async () => {
      mockGeminiEmbed.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 12000))
      )

      await expect(generateEmbedding("test")).rejects.toThrow()
    }, 15000)

    it("should fall back to OpenAI on Vertex 500 when key is present", async () => {
      process.env.OPENAI_API_KEY = "sk-test"
      mockGeminiEmbed.mockResolvedValueOnce(
        new Response("Error", { status: 500 })
      )

      const openaiResponse = {
        data: [{ embedding: new Array(768).fill(0.01) }],
      }
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(openaiResponse), { status: 200 })
      ))

      const result = await generateEmbedding("test")
      expect(result).toHaveLength(768)
      expect(result[0]).toBe(0.01)

      const fetchCalls = (fetch as any).mock.calls
      expect(fetchCalls.length).toBe(1)
      expect(fetchCalls[0][0]).toBe("https://api.openai.com/v1/embeddings")

      vi.unstubAllGlobals()
    })

    it("should fall back to OpenAI on Vertex network error when key is present", async () => {
      process.env.OPENAI_API_KEY = "sk-test"
      mockGeminiEmbed.mockRejectedValueOnce(new Error("Network error"))

      const openaiResponse = {
        data: [{ embedding: new Array(768).fill(0.02) }],
      }
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify(openaiResponse), { status: 200 })
      ))

      const result = await generateEmbedding("test")
      expect(result).toHaveLength(768)
      expect(result[0]).toBe(0.02)

      vi.unstubAllGlobals()
    })

    it("should throw when OpenAI fallback also fails", async () => {
      process.env.OPENAI_API_KEY = "sk-test"
      mockGeminiEmbed.mockResolvedValueOnce(
        new Response("Error", { status: 503 })
      )

      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(
        new Response("Rate limited", { status: 429 })
      ))

      await expect(generateEmbedding("test")).rejects.toThrow(
        "OpenAI embedding failed 429"
      )

      vi.unstubAllGlobals()
    })
  })

  describe("cosineSimilarity", () => {
    it("should calculate correct cosine similarity", () => {
      const a = [1, 0, 0]
      const b = [0, 1, 0]
      expect(cosineSimilarity(a, b)).toBe(0)
    })

    it("should return 1 for identical vectors", () => {
      const a = [1, 2, 3]
      const b = [1, 2, 3]
      expect(cosineSimilarity(a, b)).toBe(1)
    })

    it("should return 0 for zero-length vectors", () => {
      expect(cosineSimilarity([], [])).toBe(0)
    })

    it("should return 0 for mismatched vector lengths", () => {
      expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
    })

    it("should return 0 for zero vectors", () => {
      expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0)
    })

    it("should calculate similarity for normalized vectors", () => {
      const a = [0.6, 0.8]
      const b = [0.8, 0.6]
      const result = cosineSimilarity(a, b)
      expect(result).toBeCloseTo(0.96, 2)
    })
  })

  describe("buildEmbeddingText", () => {
    it("should build text from node fields", () => {
      const node: Pick<LifeNode, 'category' | 'title' | 'detail' | 'tags' | 'people'> = {
        category: "person",
        title: "John Doe",
        detail: "My best friend from college",
        tags: ["friend", "college"],
        people: ["John"]
      }

      const result = buildEmbeddingText(node)
      expect(result).toBe("person: John Doe. My best friend from college. Tags: friend, college. People: John.")
    })

    it("should handle empty tags and people", () => {
      const node: Pick<LifeNode, 'category' | 'title' | 'detail' | 'tags' | 'people'> = {
        category: "goal",
        title: "Learn Spanish",
        detail: "Want to be fluent by next year",
        tags: [],
        people: []
      }

      const result = buildEmbeddingText(node)
      expect(result).toBe("goal: Learn Spanish. Want to be fluent by next year.")
    })

    it("should truncate to 600 characters", () => {
      const longDetail = "a".repeat(600)
      const node: Pick<LifeNode, 'category' | 'title' | 'detail' | 'tags' | 'people'> = {
        category: "event",
        title: "Long event",
        detail: longDetail,
        tags: ["tag1", "tag2"],
        people: ["person1"]
      }

      const result = buildEmbeddingText(node)
      expect(result.length).toBeLessThanOrEqual(600)
    })

    it("should handle multiple tags and people", () => {
      const node: Pick<LifeNode, 'category' | 'title' | 'detail' | 'tags' | 'people'> = {
        category: "relationship",
        title: "Family dinner",
        detail: "Weekly family gathering",
        tags: ["family", "dinner", "weekly", "tradition"],
        people: ["Mom", "Dad", "Sister", "Brother"]
      }

      const result = buildEmbeddingText(node)
      expect(result).toContain("Tags: family, dinner, weekly, tradition")
      expect(result).toContain("People: Mom, Dad, Sister, Brother")
    })
  })
})
