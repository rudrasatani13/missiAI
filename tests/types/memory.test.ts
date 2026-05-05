import { describe, it, expect } from "vitest"
import type {
  MemoryCategory,
  LifeNode,
  LifeGraph,
  MemorySearchResult
} from "@/types/memory"

describe("memory types", () => {
  describe("MemoryCategory", () => {
    it("should include all expected categories", () => {
      const categories: MemoryCategory[] = [
        'person',
        'goal', 
        'habit',
        'preference',
        'event',
        'emotion',
        'skill',
        'place',
        'belief',
        'relationship'
      ]

      // This test ensures all categories are properly typed
      categories.forEach(category => {
        expect(typeof category).toBe('string')
      })
    })
  })

  describe("LifeNode", () => {
    it("should have all required fields", () => {
      const node: LifeNode = {
        id: "test-123",
        userId: "user-456",
        category: "person",
        title: "John Doe",
        detail: "My best friend",
        tags: ["friend", "college"],
        people: ["John"],
        emotionalWeight: 0.8,
        confidence: 0.9,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 5,
        lastAccessedAt: Date.now(),
        source: "conversation"
      }

      expect(node.id).toBe("test-123")
      expect(node.userId).toBe("user-456")
      expect(node.category).toBe("person")
      expect(node.title).toBe("John Doe")
      expect(node.detail).toBe("My best friend")
      expect(node.tags).toEqual(["friend", "college"])
      expect(node.people).toEqual(["John"])
      expect(node.emotionalWeight).toBe(0.8)
      expect(node.confidence).toBe(0.9)
      expect(typeof node.createdAt).toBe("number")
      expect(typeof node.updatedAt).toBe("number")
      expect(node.accessCount).toBe(5)
      expect(typeof node.lastAccessedAt).toBe("number")
      expect(node.source).toBe("conversation")
    })

    it("should support all source types", () => {
      const sources: LifeNode['source'][] = ['conversation', 'explicit', 'inferred']
      
      sources.forEach(source => {
        const node: LifeNode = {
          id: "test",
          userId: "user",
          category: "person",
          title: "Test",
          detail: "Test detail",
          tags: [],
          people: [],
          emotionalWeight: 0.5,
          confidence: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          lastAccessedAt: 0,
          source
        }
        expect(node.source).toBe(source)
      })
    })

    it("should support all categories", () => {
      const categories: MemoryCategory[] = [
        'person', 'goal', 'habit', 'preference', 'event',
        'emotion', 'skill', 'place', 'belief', 'relationship'
      ]

      categories.forEach(category => {
        const node: LifeNode = {
          id: "test",
          userId: "user",
          category,
          title: "Test",
          detail: "Test detail",
          tags: [],
          people: [],
          emotionalWeight: 0.5,
          confidence: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          lastAccessedAt: 0,
          source: "conversation"
        }
        expect(node.category).toBe(category)
      })
    })
  })

  describe("LifeGraph", () => {
    it("should have all required fields", () => {
      const graph: LifeGraph = {
        nodes: [],
        totalInteractions: 10,
        lastUpdatedAt: Date.now(),
        version: 5
      }

      expect(Array.isArray(graph.nodes)).toBe(true)
      expect(graph.totalInteractions).toBe(10)
      expect(typeof graph.lastUpdatedAt).toBe("number")
      expect(graph.version).toBe(5)
    })

    it("should support nodes array", () => {
      const node: LifeNode = {
        id: "test",
        userId: "user",
        category: "person",
        title: "Test",
        detail: "Test detail",
        tags: [],
        people: [],
        emotionalWeight: 0.5,
        confidence: 0.5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        lastAccessedAt: 0,
        source: "conversation"
      }

      const graph: LifeGraph = {
        nodes: [node],
        totalInteractions: 1,
        lastUpdatedAt: Date.now(),
        version: 1
      }

      expect(graph.nodes.length).toBe(1)
      expect(graph.nodes[0]).toEqual(node)
    })
  })

  describe("MemorySearchResult", () => {
    it("should have all required fields", () => {
      const node: LifeNode = {
        id: "test",
        userId: "user",
        category: "person",
        title: "Test",
        detail: "Test detail",
        tags: [],
        people: [],
        emotionalWeight: 0.5,
        confidence: 0.5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        lastAccessedAt: 0,
        source: "conversation"
      }

      const result: MemorySearchResult = {
        node,
        score: 0.85,
        reason: "High semantic similarity"
      }

      expect(result.node).toEqual(node)
      expect(result.score).toBe(0.85)
      expect(result.reason).toBe("High semantic similarity")
    })
  })

  describe("Type compatibility", () => {
    it("should allow LifeNode to be used in MemorySearchResult", () => {
      const node: LifeNode = {
        id: "test",
        userId: "user",
        category: "person",
        title: "Test",
        detail: "Test detail",
        tags: [],
        people: [],
        emotionalWeight: 0.5,
        confidence: 0.5,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        accessCount: 0,
        lastAccessedAt: 0,
        source: "conversation"
      }

      const result: MemorySearchResult = {
        node,
        score: 0.9,
        reason: "Test match"
      }

      expect(result.node.id).toBe("test")
    })

    it("should allow LifeNode array in LifeGraph", () => {
      const nodes: LifeNode[] = [
        {
          id: "node-1",
          userId: "user",
          category: "person",
          title: "Person 1",
          detail: "First person",
          tags: [],
          people: [],
          emotionalWeight: 0.5,
          confidence: 0.5,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          lastAccessedAt: 0,
          source: "conversation"
        },
        {
          id: "node-2",
          userId: "user",
          category: "goal",
          title: "Goal 1",
          detail: "First goal",
          tags: [],
          people: [],
          emotionalWeight: 0.7,
          confidence: 0.8,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          lastAccessedAt: 0,
          source: "explicit"
        }
      ]

      const graph: LifeGraph = {
        nodes,
        totalInteractions: 2,
        lastUpdatedAt: Date.now(),
        version: 1
      }

      expect(graph.nodes.length).toBe(2)
      expect(graph.nodes[0].category).toBe("person")
      expect(graph.nodes[1].category).toBe("goal")
    })
  })
})