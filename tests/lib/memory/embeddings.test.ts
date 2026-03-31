import { describe, it, expect, vi, beforeEach } from "vitest"
import { generateEmbedding, cosineSimilarity, buildEmbeddingText } from "@/lib/memory/embeddings"
import type { LifeNode } from "@/types/memory"

describe("embeddings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("generateEmbedding", () => {
    it("should generate embedding from Gemini API", async () => {
      const mockResponse = {
        embedding: {
          values: [0.1, 0.2, 0.3, 0.4, 0.5]
        }
      }

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const result = await generateEmbedding("test text", "test-api-key")

      expect(result).toEqual([0.1, 0.2, 0.3, 0.4, 0.5])
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test-api-key"
          },
          body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text: "test text" }] }
          })
        })
      )
    })

    it("should throw error on API failure", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response("Error", { status: 500 })
      )

      await expect(generateEmbedding("test", "key")).rejects.toThrow(
        "Embedding failed with status 500"
      )
    })

    it("should throw error on invalid response", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ invalid: "response" }), { status: 200 })
      )

      await expect(generateEmbedding("test", "key")).rejects.toThrow(
        "Embedding failed: no values in response"
      )
    })

    it("should handle timeout", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 12000))
      )

      await expect(generateEmbedding("test", "key")).rejects.toThrow()
    }, 15000)
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