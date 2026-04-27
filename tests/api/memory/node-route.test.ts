import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { LifeGraph, LifeNode } from '@/types/memory'

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock('@/lib/server/security/auth', () => ({
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
  deleteLifeNodeFromV2: vi.fn().mockResolvedValue(undefined),
  getLifeGraph: vi.fn(),
  syncLifeNodeToV2: vi.fn().mockResolvedValue(undefined),
  syncLifeNodeVector: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/server/observability/logger', () => ({
  logRequest: vi.fn(),
  logError: vi.fn(),
}))

import { DELETE, PATCH } from '@/app/api/v1/memory/[nodeId]/route'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/security/auth'
import { deleteLifeNodeFromV2, getLifeGraph, syncLifeNodeToV2 } from '@/lib/memory/life-graph'

const mockGetRequestContext = vi.mocked(getCloudflareContext)
const mockDeleteLifeNodeFromV2 = vi.mocked(deleteLifeNodeFromV2)
const mockGetVerifiedUserId = vi.mocked(getVerifiedUserId)
const mockGetLifeGraph = vi.mocked(getLifeGraph)
const mockSyncLifeNodeToV2 = vi.mocked(syncLifeNodeToV2)

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

    expect(mockDeleteLifeNodeFromV2).toHaveBeenCalledWith(
      expect.anything(),
      TEST_USER_ID,
      expect.objectContaining({ nodes: [] }),
      expect.objectContaining({ id: TEST_NODE_ID }),
    )
  })

  it('nodeId not in graph → 200 success (no-op)', async () => {
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([]))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    // Route does not return 404 for missing nodes — it's a no-op that returns success
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockDeleteLifeNodeFromV2).not.toHaveBeenCalled()
  })

  it('node belongs to different user → still deletes by nodeId (route filters by nodeId only)', async () => {
    const node = makeNode({ userId: 'different_user_456' })
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    // Route deletes by nodeId without checking userId ownership on the node
    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(mockDeleteLifeNodeFromV2).toHaveBeenCalled()
  })

  it('unauthenticated → 401', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = makeRequest('DELETE', TEST_NODE_ID)
    await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })

    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it('unexpected auth error → 401 auth error response', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new Error('auth blew up'))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ success: false, error: 'Auth error' })
  })

  it('nodeId empty string → 400 validation error', async () => {
    const req = makeRequest('DELETE', ' ')
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: '' }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid node ID')
  })

  it('nodeId too long → 400 validation error', async () => {
    const longId = 'a'.repeat(51)
    const req = makeRequest('DELETE', longId)
    const res = await DELETE(req, { params: Promise.resolve({ nodeId: longId }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid node ID')
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

    expect(res.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Storage unavailable')
  })

  it('removes only the target node and keeps others', async () => {
    const targetNode = makeNode({ id: TEST_NODE_ID })
    const otherNode = makeNode({ id: 'other-node-xyz' })
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([targetNode, otherNode]))

    const req = makeRequest('DELETE', TEST_NODE_ID)
    await DELETE(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })

    const syncedGraph = mockDeleteLifeNodeFromV2.mock.calls[0][2] as LifeGraph
    expect(syncedGraph.nodes).toHaveLength(1)
    expect(syncedGraph.nodes[0].id).toBe('other-node-xyz')
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
    expect(body.success).toBe(false)
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
    expect(mockSyncLifeNodeToV2).toHaveBeenCalled()
  })

  it('detail longer than 500 chars → 400 validation error', async () => {
    const req = makeRequest('PATCH', TEST_NODE_ID, {
      detail: 'x'.repeat(501),
    })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
  })

  it('KV unavailable → 503', async () => {
    mockGetRequestContext.mockReturnValueOnce({
      env: {},
      ctx: {} as any,
      cf: {} as any,
    } as any)

    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(503)
    expect(body).toEqual({ success: false, error: 'Storage unavailable' })
  })

  it('node not found → 404', async () => {
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([]))

    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('node owned by a different user → 404', async () => {
    const node = makeNode({ userId: 'different_user_456' })
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ success: false, error: 'Node not found' })
  })

  it('unauthenticated → 401', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new AuthenticationError())

    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })

    expect(unauthorizedResponse).toHaveBeenCalled()
  })

  it('unexpected auth error → 401 auth error response', async () => {
    mockGetVerifiedUserId.mockRejectedValueOnce(new Error('auth blew up'))

    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body).toEqual({ success: false, error: 'Auth error' })
  })

  it('updates updatedAt timestamp', async () => {
    const oldTimestamp = 1700000000000
    const node = makeNode({ updatedAt: oldTimestamp })
    mockGetLifeGraph.mockResolvedValueOnce(makeGraph([node]))

    const before = Date.now()
    const req = makeRequest('PATCH', TEST_NODE_ID, { detail: 'new detail' })
    await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const after = Date.now()

    const syncedGraph = mockSyncLifeNodeToV2.mock.calls[0][2] as LifeGraph
    const syncedNode = syncedGraph.nodes[0]
    expect(syncedNode.updatedAt).toBeGreaterThanOrEqual(before)
    expect(syncedNode.updatedAt).toBeLessThanOrEqual(after)
  })

  it('invalid JSON body → 400', async () => {
    const req = new NextRequest(
      `http://localhost/api/v1/memory/${TEST_NODE_ID}`,
      { method: 'PATCH', body: 'not-json', headers: { 'Content-Type': 'application/json' } },
    )
    const res = await PATCH(req, { params: Promise.resolve({ nodeId: TEST_NODE_ID }) })
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBe('Invalid JSON body')
  })
})
