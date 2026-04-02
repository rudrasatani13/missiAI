import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { LifeGraph, LifeNode } from '@/types/memory'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@cloudflare/next-on-pages', () => ({
  getRequestContext: vi.fn(),
}))

vi.mock('@/lib/server/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() {
      super('Unauthenticated')
      this.name = 'AuthenticationError'
    }
  },
  unauthorizedResponse: vi.fn(
    () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  ),
}))

vi.mock('@/lib/memory/life-graph', () => ({
  getLifeGraph: vi.fn(),
  saveLifeGraph: vi.fn(),
}))

vi.mock('@/lib/server/logger', () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

import { DELETE, PATCH } from '@/app/api/v1/memory/[nodeId]/route'
import { getRequestContext } from '@cloudflare/next-on-pages'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { getLifeGraph, saveLifeGraph } from '@/lib/memory/life-graph'

const mockGetRequestContext = vi.mocked(getRequestContext)
const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetLifeGraph = vi.mocked(getLifeGraph)
const mockSaveLifeGraph = vi.mocked(saveLifeGraph)

const TEST_USER_ID = 'user_test_123'
const TEST_NODE_ID = 'abc123def456'

function makeNode(overrides: Partial<LifeNode> = {}): LifeNode {
  return {
    id: TEST_NODE_ID,
    userId: TEST_USER_ID,
    category: 'goal',
    title: 'Learn TypeScript',
    detail: 'Deep dive into advanced TypeScript patterns',
    tags: ['coding', 'learning'],
    people: [],
    emotionalWeight: 0.6,
    confidence: 0.85,
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    accessCount: 3,
    lastAccessedAt: 1700000000000,
    source: 'conversation',
    ...overrides,
  }
}

function makeGraph(nodes: LifeNode[] = []): LifeGraph {
  return {
    nodes,
    totalInteractions: 5,
    lastUpdatedAt: 1700000000000,
    version: 1,
  }
}

function makeRequest(
  method: string,
  nodeId: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/memory/${nodeId}`,
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  )
}

beforeEach(() => {
  vi.clearAllMocks()

  mockGetRequestContext.mockReturnValue({
    env: {
      MISSI_MEMORY: {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
      },
    },
    ctx: {} as any,
    cf: {} as any,
  } as any)

  mockGetVerifiedUserId.mockResolvedValue(TEST_USER_ID)
  mockSaveLifeGraph.mockResolvedValue(undefined)
})

// ─── DELETE tests ─────────────────────────────────────────────────────────────

describe('DELETE /api/v1/memory/[nodeId]', () => {
  it('valid nodeId → removes node and returns { deleted: nodeId }', async () => {
    const node = makeNode()
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.deleted).toBe(TEST_NODE_ID)

    expect(mockSaveLifeGraph).toHaveBeenCalledWith(
      expect.anything(),
      TEST_USER_ID,
      expect.objectContaining({ nodes: [] }),
    )
  })

  it('nodeId not in graph → 404', async () => {
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([]))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(mockSaveLifeGraph).not.toHaveBeenCalled()
  })

  it('node belongs to different user → 404 (security check)', async () => {
    const node = makeNode({ userId: 'different_user_456' })
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(mockSaveLifeGraph).not.toHaveBeenCalled()
  })

  it('unauthenticated → 401', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = makeRequest('DELETE', TEST_NODE_ID)
    await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })

    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it('nodeId empty string → 400 validation error', async () => {
    const req = makeRequest('DELETE', ' ')
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: '' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('nodeId too long → 400 validation error', async () => {
    const longId = 'a'.repeat(51)
    const req = makeRequest('DELETE', longId)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: longId }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('KV unavailable → 500', async () => {
    mockGetRequestContext.mockReturnValueOnce({
      env: {},
      ctx: {} as any,
      cf: {} as any,
    } as any)

    const req = makeRequest('DELETE', TEST_NODE_ID)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  it('removes only the target node and keeps others', async () => {
    const targetNode = makeNode({ id: TEST_NODE_ID })
    const otherNode = makeNode({ id: 'other-node-xyz' })
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([targetNode, otherNode]))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })

    const savedGraph = mockSaveLifeGraph.mock.calls[0][2] as LifeGraph
    expect(savedGraph.nodes).toHaveLength(1)
    expect(savedGraph.nodes[0].id).toBe('other-node-xyz')
  })
})

// ─── PATCH tests ──────────────────────────────────────────────────────────────

describe('PATCH /api/v1/memory/[nodeId]', () => {
  it('valid detail update → updates node and returns without userId', async () => {
    const node = makeNode()
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const req = makeRequest('PATCH', TEST_NODE_ID, {
      detail: 'Updated detail about TypeScript mastery',
    })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.detail).toBe('Updated detail about TypeScript mastery')
    expect(body.data.userId).toBeUndefined()
  })

  it('tags with more than 8 items → 400 validation error', async () => {
    const req = makeRequest('PATCH', TEST_NODE_ID, {
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
    })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('exactly 8 tags → success', async () => {
    const node = makeNode()
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const req = makeRequest('PATCH', TEST_NODE_ID, {
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.tags).toHaveLength(8)
  })

  it('detail longer than 500 chars → 400 validation error', async () => {
    const req = makeRequest('PATCH', TEST_NODE_ID, {
      detail: 'x'.repeat(501),
    })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('node not found → 404', async () => {
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([]))

    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('unauthenticated → 401', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })

    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it('updates updatedAt timestamp', async () => {
    const oldTimestamp = 1700000000000
    const node = makeNode({ updatedAt: oldTimestamp })
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const before = Date.now()
    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const after = Date.now()

    const savedGraph = mockSaveLifeGraph.mock.calls[0][2] as LifeGraph
    const savedNode = savedGraph.nodes[0]
    expect(savedNode.updatedAt).toBeGreaterThanOrEqual(before)
    expect(savedNode.updatedAt).toBeLessThanOrEqual(after)
  })

  it('invalid JSON body → 400', async () => {
    const req = new NextRequest(
      `http://localhost/api/v1/memory/${TEST_NODE_ID}`,
      { method: 'PATCH', body: 'not-json', headers: { 'Content-Type': 'application/json' } },
    )
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })
})
