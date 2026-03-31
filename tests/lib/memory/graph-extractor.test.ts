import { describe, it, expect, vi, beforeEach } from "vitest"
import { extractLifeNodes } from "@/lib/memory/graph-extractor"
import type { ConversationEntry } from "@/types/chat"
import type { LifeGraph } from "@/types/memory"

describe("graph-extractor", () => {
  let mockConversation: ConversationEntry[]
  let mockExistingGraph: LifeGraph

  beforeEach(() => {
    vi.clearAllMocks()

    mockConversation = [
      { role: "user", content: "Hi, I'm John and I love playing guitar" },
      { role: "assistant", content: "Nice to meet you John! Guitar is a great hobby." },
      { role: "user", content: "I want to learn Spanish this year" },
      { role: "assistant", content: "That's an excellent goal!" },
      { role: "user", content: "My friend Sarah is helping me practice" },
      { role: "assistant", content: "Having a practice partner is very helpful!" }
    ]

    mockExistingGraph = {
      nodes: [
        {
          id: "existing-1",
          userId: "user-123",
          category: "person",
          title: "John",
          detail: "User's name",
          tags: ["self"],
          people: [],
          emotionalWeight: 0.5,
          confidence: 0.9,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          accessCount: 0,
          lastAccessedAt: 0,
          source: "conversation"
        }
      ],
      totalInteractions: 5,
      lastUpdatedAt: Date.now(),
      version: 1
    }
  })

  describe("extractLifeNodes", () => {
    it("should extract valid life nodes from conversation", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      category: "skill",
                      title: "Playing guitar",
                      detail: "User enjoys playing guitar as a hobby",
                      tags: ["music", "hobby", "guitar"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.9,
                      source: "conversation"
                    },
                    {
                      category: "goal",
                      title: "Learn Spanish",
                      detail: "User wants to learn Spanish this year",
                      tags: ["language", "learning", "spanish"],
                      people: [],
                      emotionalWeight: 0.7,
                      confidence: 0.8,
                      source: "conversation"
                    },
                    {
                      category: "person",
                      title: "Sarah",
                      detail: "Friend who helps with Spanish practice",
                      tags: ["friend", "spanish", "practice"],
                      people: ["Sarah"],
                      emotionalWeight: 0.6,
                      confidence: 0.8,
                      source: "conversation"
                    }
                  ])
                }
              ]
            }
          }
        ]
      }

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(fetchSpy).toHaveBeenCalledWith(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": "test-api-key"
          }
        })
      )

      expect(results).toHaveLength(3)
      expect(results[0].category).toBe("skill")
      expect(results[0].title).toBe("Playing guitar")
      expect(results[1].category).toBe("goal")
      expect(results[1].title).toBe("Learn Spanish")
      expect(results[2].category).toBe("person")
      expect(results[2].title).toBe("Sarah")
    })

    it("should filter out low confidence nodes", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      category: "skill",
                      title: "High confidence",
                      detail: "This is confident",
                      tags: ["test"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.8,
                      source: "conversation"
                    },
                    {
                      category: "goal",
                      title: "Low confidence",
                      detail: "This is uncertain",
                      tags: ["test"],
                      people: [],
                      emotionalWeight: 0.5,
                      confidence: 0.4,
                      source: "conversation"
                    }
                  ])
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe("High confidence")
    })

    it("should filter out invalid categories", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      category: "person",
                      title: "Valid category",
                      detail: "This is valid",
                      tags: ["test"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.8,
                      source: "conversation"
                    },
                    {
                      category: "invalid_category",
                      title: "Invalid category",
                      detail: "This should be filtered",
                      tags: ["test"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.8,
                      source: "conversation"
                    }
                  ])
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toHaveLength(1)
      expect(results[0].category).toBe("person")
    })

    it("should deduplicate against existing nodes", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      category: "person",
                      title: "John", // Exact match with existing
                      detail: "User's name",
                      tags: ["self"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.8,
                      source: "conversation"
                    },
                    {
                      category: "person",
                      title: "Sarah", // New node
                      detail: "Friend who helps with practice",
                      tags: ["friend"],
                      people: ["Sarah"],
                      emotionalWeight: 0.7,
                      confidence: 0.8,
                      source: "conversation"
                    }
                  ])
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe("Sarah")
    })

    it("should handle partial title matches in deduplication", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      category: "person",
                      title: "John Smith", // Contains existing "John"
                      detail: "Full name",
                      tags: ["self"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.8,
                      source: "conversation"
                    }
                  ])
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toHaveLength(0) // Should be filtered out due to partial match
    })

    it("should handle markdown-wrapped JSON response", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: `\`\`\`json
${JSON.stringify([
  {
    category: "skill",
    title: "Guitar playing",
    detail: "User plays guitar",
    tags: ["music"],
    people: [],
    emotionalWeight: 0.8,
    confidence: 0.8,
    source: "conversation"
  }
])}
\`\`\``
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe("Guitar playing")
    })

    it("should truncate long fields", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      category: "skill",
                      title: "a".repeat(100), // Too long
                      detail: "b".repeat(600), // Too long
                      tags: Array(10).fill("tag"), // Too many
                      people: ["Person1", "Person2"],
                      emotionalWeight: 1.5, // Out of range
                      confidence: 0.8,
                      source: "conversation"
                    }
                  ])
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toHaveLength(1)
      expect(results[0].title.length).toBe(80)
      expect(results[0].detail.length).toBe(500)
      expect(results[0].tags.length).toBe(8)
      expect(results[0].emotionalWeight).toBe(1) // Clamped to max
    })

    it("should handle API errors gracefully", async () => {
      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response("Error", { status: 500 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toEqual([])
    })

    it("should handle invalid JSON response", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: "invalid json response"
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toEqual([])
    })

    it("should handle non-array JSON response", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({ not: "an array" })
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toEqual([])
    })

    it("should handle timeout", async () => {
      vi.spyOn(global, "fetch").mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 20000))
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toEqual([])
    }, 25000)

    it("should use only last 6 messages", async () => {
      const longConversation = Array(20).fill(null).map((_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`
      })) as ConversationEntry[]

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([])
                }
              ]
            }
          }
        ]
      }

      const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      await extractLifeNodes(
        longConversation,
        mockExistingGraph,
        "test-api-key"
      )

      const requestBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string)
      const conversationText = requestBody.contents[0].parts[0].text
      
      // Should only contain the last 6 messages
      expect(conversationText).toContain("Message 14")
      expect(conversationText).toContain("Message 19")
      expect(conversationText).not.toContain("Message 13")
    })

    it("should handle missing required fields", async () => {
      const mockResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify([
                    {
                      category: "person",
                      // Missing title
                      detail: "Missing title",
                      tags: ["test"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.8,
                      source: "conversation"
                    },
                    {
                      category: "goal",
                      title: "Valid node",
                      detail: "Has all required fields",
                      tags: ["test"],
                      people: [],
                      emotionalWeight: 0.8,
                      confidence: 0.8,
                      source: "conversation"
                    }
                  ])
                }
              ]
            }
          }
        ]
      }

      vi.spyOn(global, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      )

      const results = await extractLifeNodes(
        mockConversation,
        mockExistingGraph,
        "test-api-key"
      )

      expect(results).toHaveLength(1)
      expect(results[0].title).toBe("Valid node")
    })
  })
})