import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  upsertLifeNode,
  searchSimilarNodes,
  deleteUserVectors,
  type VectorizeIndex,
  type VectorizeEnv
} from "@/lib/memory/vectorize"
import type { LifeNode } from "@/types/memory"

describe("vectorize", () => {
  let mockVectorizeIndex: VectorizeIndex
  let mockVectorizeEnv: VectorizeEnv
  let testNode: LifeNode

  beforeEach(() => {
    vi.clearAllMocks()

    mockVectorizeIndex = {
      upsert: vi.fn().mockResolvedValue({ count: 1 }),
      query: vi.fn().mockResolvedValue({
        matches: [],
        count: 0
      }),
      deleteByIds: vi.fn().mockResolvedValue({ count: 1 })
    }

    mockVectorizeEnv = {
      LIFE_GRAPH: mockVectorizeIndex
    }

    testNode = {
      id: "test-node-123",
      userId: "user-123",
      category: "person",
      title: "John Doe",
      detail: "My best friend from college",
      tags: ["friend", "college"],
      people: ["John"],
      emotionalWeight: 0.8,
      confidence: 0.9,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      accessCount: 0,
      lastAccessedAt: 0,
      source: "conversation"
    }
  })

  describe("upsertLifeNode", () => {
    it("should upsert node with correct metadata", async () => {
      const embedding = [0.1, 0.2, 0.3]

      await upsertLifeNode(mockVectorizeEnv, testNode, embedding)

      expect(mockVectorizeIndex.upsert).toHaveBeenCalledWith([
        {
          id: "test-node-123",
          values: [0.1, 0.2, 0.3],
          metadata: {
            userId: "user-123",
            category: "person",
            title: "John Doe",
            detail: "My best friend from college",
            tags: JSON.stringify(["friend", "college"]),
            people: JSON.stringify(["John"]),
            emotionalWeight: 0.8,
            createdAt: testNode.createdAt,
            updatedAt: testNode.updatedAt
          }
        }
      ])
    })
  })

  describe("searchSimilarNodes", () => {
    it("should search and return formatted results", async () => {
      const mockMatches = [
        {
          id: "node-1",
          score: 0.85,
          metadata: {
            userId: "user-123",
            category: "person",
            title: "Jane Smith",
            detail: "Colleague from work",
            tags: JSON.stringify(["work", "colleague"]),
            people: JSON.stringify(["Jane"]),
            emotionalWeight: 0.6,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        },
        {
          id: "node-2",
          score: 0.75,
          metadata: {
            userId: "user-123",
            category: "goal",
            title: "Learn programming",
            detail: "Want to become a software developer",
            tags: JSON.stringify(["programming", "career"]),
            people: JSON.stringify([]),
            emotionalWeight: 0.9,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        }
      ]

      vi.mocked(mockVectorizeIndex.query).mockResolvedValueOnce({
        matches: mockMatches,
        count: 2
      })

      const queryEmbedding = [0.1, 0.2, 0.3]
      const results = await searchSimilarNodes(
        mockVectorizeEnv,
        queryEmbedding,
        "user-123",
        { topK: 5, minScore: 0.7 }
      )

      expect(mockVectorizeIndex.query).toHaveBeenCalledWith(queryEmbedding, {
        topK: 5,
        filter: { userId: "user-123" },
        returnMetadata: "all"
      })

      expect(results).toHaveLength(2)
      expect(results[0].node.title).toBe("Jane Smith")
      expect(results[0].score).toBe(0.85)
      expect(results[0].reason).toBe("Semantically similar (score: 0.85)")
      expect(results[1].node.title).toBe("Learn programming")
      expect(results[1].score).toBe(0.75)
    })

    it("should filter by category", async () => {
      const mockMatches = [
        {
          id: "node-1",
          score: 0.85,
          metadata: {
            userId: "user-123",
            category: "person",
            title: "Jane Smith",
            detail: "Colleague",
            tags: JSON.stringify([]),
            people: JSON.stringify([]),
            emotionalWeight: 0.6,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        },
        {
          id: "node-2",
          score: 0.75,
          metadata: {
            userId: "user-123",
            category: "goal",
            title: "Learn programming",
            detail: "Career goal",
            tags: JSON.stringify([]),
            people: JSON.stringify([]),
            emotionalWeight: 0.9,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        }
      ]

      vi.mocked(mockVectorizeIndex.query).mockResolvedValueOnce({
        matches: mockMatches,
        count: 2
      })

      const results = await searchSimilarNodes(
        mockVectorizeEnv,
        [0.1, 0.2, 0.3],
        "user-123",
        { category: "person" }
      )

      expect(results).toHaveLength(1)
      expect(results[0].node.category).toBe("person")
    })

    it("should filter by minimum score", async () => {
      const mockMatches = [
        {
          id: "node-1",
          score: 0.85,
          metadata: {
            userId: "user-123",
            category: "person",
            title: "High score",
            detail: "Above threshold",
            tags: JSON.stringify([]),
            people: JSON.stringify([]),
            emotionalWeight: 0.6,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        },
        {
          id: "node-2",
          score: 0.5,
          metadata: {
            userId: "user-123",
            category: "goal",
            title: "Low score",
            detail: "Below threshold",
            tags: JSON.stringify([]),
            people: JSON.stringify([]),
            emotionalWeight: 0.9,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        }
      ]

      vi.mocked(mockVectorizeIndex.query).mockResolvedValueOnce({
        matches: mockMatches,
        count: 2
      })

      const results = await searchSimilarNodes(
        mockVectorizeEnv,
        [0.1, 0.2, 0.3],
        "user-123",
        { minScore: 0.65 }
      )

      expect(results).toHaveLength(1)
      expect(results[0].node.title).toBe("High score")
    })

    it("should handle malformed metadata gracefully", async () => {
      const mockMatches = [
        {
          id: "node-1",
          score: 0.85,
          metadata: {
            userId: "user-123",
            category: "person",
            title: "Valid node",
            detail: "Good metadata",
            tags: "invalid-json",
            people: JSON.stringify(["John"]),
            emotionalWeight: 0.6,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        }
      ]

      vi.mocked(mockVectorizeIndex.query).mockResolvedValueOnce({
        matches: mockMatches,
        count: 1
      })

      const results = await searchSimilarNodes(
        mockVectorizeEnv,
        [0.1, 0.2, 0.3],
        "user-123"
      )

      expect(results).toHaveLength(1)
      expect(results[0].node.tags).toEqual([]) // Should fallback to empty array
      expect(results[0].node.people).toEqual(["John"]) // Should parse correctly
    })

    it("should sort results by score descending", async () => {
      const mockMatches = [
        {
          id: "node-1",
          score: 0.75,
          metadata: {
            userId: "user-123",
            category: "person",
            title: "Second highest",
            detail: "Medium score",
            tags: JSON.stringify([]),
            people: JSON.stringify([]),
            emotionalWeight: 0.6,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        },
        {
          id: "node-2",
          score: 0.95,
          metadata: {
            userId: "user-123",
            category: "goal",
            title: "Highest score",
            detail: "Best match",
            tags: JSON.stringify([]),
            people: JSON.stringify([]),
            emotionalWeight: 0.9,
            createdAt: 1640995200000,
            updatedAt: 1640995200000
          }
        }
      ]

      vi.mocked(mockVectorizeIndex.query).mockResolvedValueOnce({
        matches: mockMatches,
        count: 2
      })

      const results = await searchSimilarNodes(
        mockVectorizeEnv,
        [0.1, 0.2, 0.3],
        "user-123"
      )

      expect(results[0].node.title).toBe("Highest score")
      expect(results[1].node.title).toBe("Second highest")
    })
  })

  describe("deleteUserVectors", () => {
    it("should delete vectors by IDs", async () => {
      const nodeIds = ["node-1", "node-2", "node-3"]

      await deleteUserVectors(mockVectorizeEnv, nodeIds)

      expect(mockVectorizeIndex.deleteByIds).toHaveBeenCalledWith(nodeIds)
    })

    it("should handle empty array", async () => {
      await deleteUserVectors(mockVectorizeEnv, [])

      expect(mockVectorizeIndex.deleteByIds).not.toHaveBeenCalled()
    })
  })
})