import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import type { LifeGraph, LifeNode, MemorySearchResult } from "@/types/memory"

vi.mock("@/lib/server/security/auth", () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() {
      super("Unauthenticated")
      this.name = "AuthenticationError"
    }
  },
  unauthorizedResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }),
  ),
}))

vi.mock("@/lib/server/platform/bindings", () => ({
  getCloudflareKVBinding: vi.fn(),
  getCloudflareVectorizeEnv: vi.fn(),
}))

vi.mock("@/lib/memory/life-graph", () => ({
  deleteLifeNodeFromV2: vi.fn().mockResolvedValue(undefined),
  getLifeGraph: vi.fn(),
  getLifeGraphReadSnapshot: vi.fn(),
  addOrUpdateNodes: vi.fn().mockResolvedValue(undefined),
  searchLifeGraph: vi.fn(),
  syncLifeGraphMetaToV2: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/memory/graph-extractor", () => ({
  extractLifeNodes: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/server/security/rate-limiter", () => ({
  checkRateLimit: vi.fn(),
  rateLimitExceededResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Rate limit exceeded" }), { status: 429 }),
  ),
  rateLimitHeaders: vi.fn(() => ({ "X-RateLimit-Limit": "60" })),
}))

vi.mock("@/lib/billing/tier-checker", () => ({
  getUserPlan: vi.fn(),
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("@/lib/server/platform/wait-until", () => ({
  waitUntil: vi.fn(),
}))

vi.mock("@/lib/analytics/event-store", () => ({
  recordAnalyticsUsage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/gamification/xp-engine", () => ({
  awardXP: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/memory/vectorize", () => ({
  deleteUserVectors: vi.fn().mockResolvedValue(undefined),
}))

import { GET, POST, DELETE } from "@/app/api/v1/memory/route"
import { getVerifiedUserId } from "@/lib/server/security/auth"
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from "@/lib/server/platform/bindings"
import {
  addOrUpdateNodes,
  deleteLifeNodeFromV2,
  getLifeGraph,
  getLifeGraphReadSnapshot,
  searchLifeGraph,
  syncLifeGraphMetaToV2,
} from "@/lib/memory/life-graph"
import { extractLifeNodes } from "@/lib/memory/graph-extractor"
import { checkRateLimit } from "@/lib/server/security/rate-limiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { waitUntil } from "@/lib/server/platform/wait-until"
import { recordAnalyticsUsage } from "@/lib/analytics/event-store"
import { awardXP } from "@/lib/gamification/xp-engine"
import { deleteUserVectors } from "@/lib/memory/vectorize"
import { logError } from "@/lib/server/observability/logger"

const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetCloudflareKVBinding = vi.mocked(getCloudflareKVBinding)
const mockGetCloudflareVectorizeEnv = vi.mocked(getCloudflareVectorizeEnv)
const mockAddOrUpdateNodes = vi.mocked(addOrUpdateNodes)
const mockGetLifeGraph = vi.mocked(getLifeGraph)
const mockGetLifeGraphReadSnapshot = vi.mocked(getLifeGraphReadSnapshot)
const mockSearchLifeGraph = vi.mocked(searchLifeGraph)
const mockDeleteLifeNodeFromV2 = vi.mocked(deleteLifeNodeFromV2)
const mockExtractLifeNodes = vi.mocked(extractLifeNodes)
const mockCheckRateLimit = vi.mocked(checkRateLimit)
const mockGetUserPlan = vi.mocked(getUserPlan)
const mockWaitUntil = vi.mocked(waitUntil)
const mockRecordAnalyticsUsage = vi.mocked(recordAnalyticsUsage)
const mockAwardXP = vi.mocked(awardXP)
const mockSyncLifeGraphMetaToV2 = vi.mocked(syncLifeGraphMetaToV2)
const mockDeleteUserVectors = vi.mocked(deleteUserVectors)
const mockLogError = vi.mocked(logError)

function makeKV() {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

function makeNode(overrides: Partial<LifeNode> = {}): LifeNode {
  return {
    id: "node-1",
    userId: "user_test123",
    category: "goal",
    title: "Learn TypeScript",
    detail: "Practice advanced typing",
    tags: [],
    people: [],
    emotionalWeight: 0.5,
    confidence: 0.9,
    createdAt: 1,
    updatedAt: 1,
    accessCount: 0,
    lastAccessedAt: 1,
    source: "conversation",
    ...overrides,
  }
}

function makeGraph(nodes: LifeNode[] = []): LifeGraph {
  return {
    nodes,
    totalInteractions: 3,
    lastUpdatedAt: 1,
    version: 1,
  }
}

describe("memory parent route", () => {
  const mockKV = makeKV()
  const mockVectorizeEnv = { LIFE_GRAPH: {} as never }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetVerifiedUserId.mockResolvedValue("user_test123")
    mockGetCloudflareKVBinding.mockReturnValue(mockKV as never)
    mockGetCloudflareVectorizeEnv.mockReturnValue(mockVectorizeEnv)
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      limit: 60,
      remaining: 59,
      resetAt: 0,
      retryAfter: 0,
    })
    mockGetUserPlan.mockResolvedValue("free")
    mockGetLifeGraphReadSnapshot.mockResolvedValue(makeGraph())
    mockGetLifeGraph.mockResolvedValue(makeGraph())
    mockSearchLifeGraph.mockResolvedValue([])
  })

  describe("GET", () => {
    it("searches the life graph when query is present", async () => {
      const results: MemorySearchResult[] = [
        {
          node: makeNode({ id: "search-1", title: "Budget goal" }),
          score: 0.82,
          reason: "Category match",
        },
      ]
      mockSearchLifeGraph.mockResolvedValueOnce(results)

      const res = await GET(
        new NextRequest("http://localhost/api/v1/memory?query=budget&category=goal"),
      )

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true, data: results })
      expect(mockSearchLifeGraph).toHaveBeenCalledWith(
        mockKV,
        mockVectorizeEnv,
        "user_test123",
        "budget",
        { topK: 10, category: "goal" },
      )
      expect(mockGetLifeGraphReadSnapshot).not.toHaveBeenCalled()
    })

    it("returns the full graph when query is absent", async () => {
      const graph = makeGraph([makeNode()])
      mockGetLifeGraphReadSnapshot.mockResolvedValueOnce(graph)

      const res = await GET(new NextRequest("http://localhost/api/v1/memory"))

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true, data: graph })
      expect(mockGetLifeGraphReadSnapshot).toHaveBeenCalledWith(mockKV, "user_test123")
      expect(mockSearchLifeGraph).not.toHaveBeenCalled()
    })

    it("returns 503 when KV is unavailable instead of an empty successful graph", async () => {
      mockGetCloudflareKVBinding.mockReturnValueOnce(null)

      const res = await GET(new NextRequest("http://localhost/api/v1/memory"))

      expect(res.status).toBe(503)
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        code: "SERVICE_UNAVAILABLE",
      })
      expect(mockGetLifeGraphReadSnapshot).not.toHaveBeenCalled()
    })

    it("returns 500 when graph storage reads fail instead of an empty successful graph", async () => {
      mockGetLifeGraphReadSnapshot.mockRejectedValueOnce(new Error("kv read failed"))

      const res = await GET(new NextRequest("http://localhost/api/v1/memory"))

      expect(res.status).toBe(500)
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        code: "INTERNAL_ERROR",
      })
    })

    it("logs memory read analytics background failures", async () => {
      mockRecordAnalyticsUsage.mockRejectedValueOnce(new Error("analytics failed"))

      const res = await GET(new NextRequest("http://localhost/api/v1/memory"))

      expect(res.status).toBe(200)
      const background = mockWaitUntil.mock.calls[0]?.[0] as Promise<unknown>
      await background
      expect(mockLogError).toHaveBeenCalledWith(
        "memory.read.analytics_error",
        expect.any(Error),
        "user_test123",
      )
    })

    it("rejects oversized queries", async () => {
      const res = await GET(
        new NextRequest(`http://localhost/api/v1/memory?query=${"x".repeat(501)}`),
      )

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        code: "VALIDATION_ERROR",
      })
      expect(mockSearchLifeGraph).not.toHaveBeenCalled()
    })

    it("rejects invalid categories", async () => {
      const res = await GET(
        new NextRequest("http://localhost/api/v1/memory?query=test&category=invalid"),
      )

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        error: "Invalid category",
        code: "VALIDATION_ERROR",
      })
      expect(mockSearchLifeGraph).not.toHaveBeenCalled()
    })
  })

  describe("POST", () => {
    it("returns 400 for invalid JSON", async () => {
      const req = new NextRequest("http://localhost/api/v1/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json{{",
      })

      const res = await POST(req)

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        error: "Invalid JSON body",
        code: "VALIDATION_ERROR",
      })
      expect(mockExtractLifeNodes).not.toHaveBeenCalled()
    })

    it("returns 400 when the memory schema rejects the body", async () => {
      const res = await POST(
        new NextRequest("http://localhost/api/v1/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: [{ role: "user", content: "hi" }],
            interactionCount: 1,
          }),
        }),
      )

      expect(res.status).toBe(400)
      await expect(res.json()).resolves.toMatchObject({
        success: false,
        code: "VALIDATION_ERROR",
      })
      expect(mockExtractLifeNodes).not.toHaveBeenCalled()
    })

    it("short-circuits on incognito without touching storage", async () => {
      const res = await POST(
        new NextRequest("http://localhost/api/v1/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: [
              { role: "user", content: "hi" },
              { role: "assistant", content: "hello" },
            ],
            interactionCount: 2,
            incognito: true,
          }),
        }),
      )

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ success: true, skipped: "incognito" })
      expect(mockGetCloudflareKVBinding).not.toHaveBeenCalled()
      expect(mockGetLifeGraph).not.toHaveBeenCalled()
      expect(mockExtractLifeNodes).not.toHaveBeenCalled()
    })

    it("writes extracted nodes and schedules follow-up work", async () => {
      const initialGraph = makeGraph([])
      const updatedGraph = makeGraph([makeNode()])
      mockGetLifeGraph
        .mockResolvedValueOnce(initialGraph)
        .mockResolvedValueOnce(updatedGraph)
      mockExtractLifeNodes.mockResolvedValueOnce([
        {
          category: "goal",
          title: "Learn TypeScript",
          detail: "Practice advanced typing",
          tags: ["coding"],
          people: [],
          emotionalWeight: 0.7,
          confidence: 0.95,
          source: "conversation",
        },
      ])

      const res = await POST(
        new NextRequest("http://localhost/api/v1/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversation: [
              { role: "user", content: "I want to learn TypeScript deeply" },
              { role: "assistant", content: "Great goal." },
            ],
            interactionCount: 4,
          }),
        }),
      )

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({ success: true, data: { added: 1, updated: 0 } })
      expect(mockSyncLifeGraphMetaToV2).toHaveBeenCalledWith(
        mockKV,
        "user_test123",
        expect.objectContaining({ totalInteractions: 4 }),
      )
      expect(mockAddOrUpdateNodes).toHaveBeenCalledWith(
        mockKV,
        mockVectorizeEnv,
        "user_test123",
        [expect.objectContaining({ userId: "user_test123", title: "Learn TypeScript" })],
      )
      expect(mockRecordAnalyticsUsage).toHaveBeenCalledWith(mockKV, { type: "memory_write", userId: "user_test123" })
      expect(mockAwardXP).toHaveBeenCalledWith(mockKV, "user_test123", "chat", 3)
      expect(mockAwardXP).toHaveBeenCalledWith(mockKV, "user_test123", "memory", 2)
      expect(mockWaitUntil).toHaveBeenCalled()
    })
  })

  describe("DELETE", () => {
    it("accepts nodeId from the query string", async () => {
      const node = makeNode({ id: "query-node" })
      mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

      const res = await DELETE(
        new NextRequest("http://localhost/api/v1/memory?nodeId=query-node", { method: "DELETE" }),
      )

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({
        success: true,
        data: { deleted: "query-node" },
      })
      expect(mockDeleteLifeNodeFromV2).toHaveBeenCalledWith(
        mockKV,
        "user_test123",
        expect.objectContaining({ nodes: [] }),
        node,
      )
      expect(mockDeleteUserVectors).toHaveBeenCalledWith(mockVectorizeEnv, ["query-node"])
    })

    it("accepts nodeId from the JSON body", async () => {
      const node = makeNode({ id: "body-node" })
      mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

      const res = await DELETE(
        new NextRequest("http://localhost/api/v1/memory", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodeId: "body-node" }),
        }),
      )

      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toEqual({
        success: true,
        data: { deleted: "body-node" },
      })
      expect(mockDeleteLifeNodeFromV2).toHaveBeenCalledWith(
        mockKV,
        "user_test123",
        expect.objectContaining({ nodes: [] }),
        node,
      )
    })
  })
})
