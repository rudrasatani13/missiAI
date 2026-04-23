// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LifeGraph, LifeNode, MemoryCategory } from '@/types/memory'

// Module-level state storage for the React mock
let mockStateStore: any[] = []
let mockStateIdx = 0

vi.mock('react', () => ({
  useState: (initial: any) => {
    const idx = mockStateIdx++
    if (mockStateStore[idx] === undefined) mockStateStore[idx] = initial
    const setValue = (v: any) => {
      mockStateStore[idx] =
        typeof v === 'function' ? v(mockStateStore[idx]) : v
    }
    return [mockStateStore[idx], setValue]
  },
  // Skip effects to avoid async side effects bleeding between tests
  useEffect: (_fn: any, _deps?: any[]) => {},
  // Execute memos immediately so computed values are available
  useMemo: (fn: any, _deps?: any[]) => fn(),
  useCallback: (fn: any, _deps?: any[]) => fn,
}))

import { useMemoryDashboard } from '@/hooks/useMemoryDashboard'

// State slot indices (must match useState order in the hook):
// 0: graph, 1: isLoading, 2: error, 3: selectedCategory, 4: searchQuery, 5: deletingId

function setupState(overrides: {
  graph?: LifeGraph | null
  isLoading?: boolean
  error?: string | null
  selectedCategory?: MemoryCategory | 'all'
  searchQuery?: string
  deletingId?: string | null
} = {}) {
  mockStateIdx = 0
  mockStateStore = [
    overrides.graph !== undefined ? overrides.graph : null,
    overrides.isLoading !== undefined ? overrides.isLoading : false,
    overrides.error !== undefined ? overrides.error : null,
    overrides.selectedCategory !== undefined ? overrides.selectedCategory : 'all',
    overrides.searchQuery !== undefined ? overrides.searchQuery : '',
    overrides.deletingId !== undefined ? overrides.deletingId : null,
  ]
}

function makeNode(overrides: Partial<LifeNode> = {}): LifeNode {
  return {
    id: 'node-' + Math.random().toString(36).slice(2, 8),
    userId: 'user1',
    category: 'goal',
    title: 'Test node',
    detail: 'Some detail',
    tags: [],
    people: [],
    emotionalWeight: 0.5,
    confidence: 0.8,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    accessCount: 0,
    lastAccessedAt: 0,
    source: 'conversation',
    ...overrides,
  }
}

function makeGraph(nodes: LifeNode[], totalInteractions = 0): LifeGraph {
  return {
    nodes,
    totalInteractions,
    lastUpdatedAt: Date.now(),
    version: 1,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStateIdx = 0
  mockStateStore = []
})

// ─── filteredNodes ────────────────────────────────────────────────────────────

describe('filteredNodes', () => {
  it('empty graph → filteredNodes is []', () => {
    setupState({ graph: makeGraph([]) })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toEqual([])
  })

  it('null graph → filteredNodes is []', () => {
    setupState({ graph: null })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toEqual([])
  })

  it('filter by category returns only matching nodes', () => {
    const personNodes = [
      makeNode({ id: 'p1', category: 'person', title: 'Alice' }),
      makeNode({ id: 'p2', category: 'person', title: 'Bob' }),
    ]
    const goalNode = makeNode({ id: 'g1', category: 'goal', title: 'Run 5k' })
    const graph = makeGraph([...personNodes, goalNode])

    setupState({ graph, selectedCategory: 'person' })
    const { filteredNodes } = useMemoryDashboard()

    expect(filteredNodes).toHaveLength(2)
    expect(filteredNodes.every((n) => n.category === 'person')).toBe(true)
  })

  it('filter by category with 5 nodes returns only person nodes', () => {
    const nodes: LifeNode[] = [
      makeNode({ id: 'p1', category: 'person' }),
      makeNode({ id: 'p2', category: 'person' }),
      makeNode({ id: 'p3', category: 'person' }),
      makeNode({ id: 'g1', category: 'goal' }),
      makeNode({ id: 'h1', category: 'habit' }),
    ]
    setupState({ graph: makeGraph(nodes), selectedCategory: 'person' })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toHaveLength(3)
    expect(filteredNodes.every((n) => n.category === 'person')).toBe(true)
  })

  it('search "coffee" returns nodes with coffee in title', () => {
    const coffeeNode = makeNode({ id: 'c1', title: 'I love coffee' })
    const other = makeNode({ id: 'o1', title: 'Go to the gym' })
    setupState({ graph: makeGraph([coffeeNode, other]), searchQuery: 'coffee' })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toHaveLength(1)
    expect(filteredNodes[0].id).toBe('c1')
  })

  it('search "coffee" returns nodes with coffee in detail', () => {
    const node = makeNode({ id: 'c1', title: 'Morning routine', detail: 'Starts with coffee and meditation' })
    const other = makeNode({ id: 'o1', title: 'Exercise', detail: 'Run 5k' })
    setupState({ graph: makeGraph([node, other]), searchQuery: 'coffee' })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toHaveLength(1)
    expect(filteredNodes[0].id).toBe('c1')
  })

  it('search "coffee" returns nodes with coffee in tags', () => {
    const node = makeNode({ id: 'c1', title: 'Morning habits', tags: ['coffee', 'tea'] })
    const other = makeNode({ id: 'o1', title: 'Evening habits', tags: ['reading'] })
    setupState({ graph: makeGraph([node, other]), searchQuery: 'coffee' })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toHaveLength(1)
    expect(filteredNodes[0].id).toBe('c1')
  })

  it('search with less than 2 chars → no filtering, all nodes returned', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b' })]
    setupState({ graph: makeGraph(nodes), searchQuery: 'c' })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toHaveLength(2)
  })

  it('search with empty string → all nodes returned', () => {
    const nodes = [makeNode({ id: 'a' }), makeNode({ id: 'b' }), makeNode({ id: 'c' })]
    setupState({ graph: makeGraph(nodes), searchQuery: '' })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toHaveLength(3)
  })

  it('filteredNodes sorted by updatedAt descending', () => {
    const now = Date.now()
    const oldest = makeNode({ id: 'old', updatedAt: now - 10000 })
    const newest = makeNode({ id: 'new', updatedAt: now })
    const middle = makeNode({ id: 'mid', updatedAt: now - 5000 })
    setupState({ graph: makeGraph([oldest, newest, middle]) })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes[0].id).toBe('new')
    expect(filteredNodes[1].id).toBe('mid')
    expect(filteredNodes[2].id).toBe('old')
  })

  it('search is case-insensitive', () => {
    const node = makeNode({ id: 'c1', title: 'I love Coffee' })
    setupState({ graph: makeGraph([node]), searchQuery: 'coffee' })
    const { filteredNodes } = useMemoryDashboard()
    expect(filteredNodes).toHaveLength(1)
  })
})

// ─── categoryCounts ───────────────────────────────────────────────────────────

describe('categoryCounts', () => {
  it('categoryCounts["all"] equals total node count', () => {
    const nodes = [
      makeNode({ category: 'person' }),
      makeNode({ category: 'person' }),
      makeNode({ category: 'goal' }),
    ]
    setupState({ graph: makeGraph(nodes) })
    const { categoryCounts } = useMemoryDashboard()
    expect(categoryCounts['all']).toBe(3)
  })

  it('counts per category are correct', () => {
    const nodes = [
      makeNode({ category: 'person' }),
      makeNode({ category: 'person' }),
      makeNode({ category: 'goal' }),
      makeNode({ category: 'habit' }),
    ]
    setupState({ graph: makeGraph(nodes) })
    const { categoryCounts } = useMemoryDashboard()
    expect(categoryCounts['person']).toBe(2)
    expect(categoryCounts['goal']).toBe(1)
    expect(categoryCounts['habit']).toBe(1)
    expect(categoryCounts['skill']).toBe(0)
  })

  it('null graph → all counts are 0', () => {
    setupState({ graph: null })
    const { categoryCounts } = useMemoryDashboard()
    expect(categoryCounts['all']).toBe(0)
    expect(categoryCounts['person']).toBe(0)
  })
})

// ─── stats ────────────────────────────────────────────────────────────────────

describe('stats', () => {
  it('empty graph → totalNodes is 0', () => {
    setupState({ graph: makeGraph([]) })
    const { stats } = useMemoryDashboard()
    expect(stats.totalNodes).toBe(0)
  })

  it('null graph → totalNodes is 0', () => {
    setupState({ graph: null })
    const { stats } = useMemoryDashboard()
    expect(stats.totalNodes).toBe(0)
    expect(stats.mostAccessedNode).toBeNull()
    expect(stats.topCategory).toBeNull()
  })

  it('stats.topCategory is the category with most nodes', () => {
    const nodes = [
      makeNode({ category: 'person' }),
      makeNode({ category: 'person' }),
      makeNode({ category: 'person' }),
      makeNode({ category: 'goal' }),
      makeNode({ category: 'goal' }),
    ]
    setupState({ graph: makeGraph(nodes) })
    const { stats } = useMemoryDashboard()
    expect(stats.topCategory).toBe('person')
  })

  it('stats.mostAccessedNode is the node with highest accessCount', () => {
    const low = makeNode({ id: 'low', accessCount: 2 })
    const high = makeNode({ id: 'high', accessCount: 10 })
    const mid = makeNode({ id: 'mid', accessCount: 5 })
    setupState({ graph: makeGraph([low, high, mid]) })
    const { stats } = useMemoryDashboard()
    expect(stats.mostAccessedNode?.id).toBe('high')
  })

  it('stats.totalNodes matches graph.nodes.length', () => {
    const nodes = [makeNode(), makeNode(), makeNode(), makeNode()]
    setupState({ graph: makeGraph(nodes, 20) })
    const { stats } = useMemoryDashboard()
    expect(stats.totalNodes).toBe(4)
    expect(stats.totalInteractions).toBe(20)
  })
})

// ─── deleteNode ───────────────────────────────────────────────────────────────

describe('deleteNode', () => {
  it('deleteNode calls DELETE /api/v1/memory/{nodeId}', async () => {
    const node = makeNode({ id: 'target-node' })
    setupState({ graph: makeGraph([node]) })

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { deleted: 'target-node' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { deleteNode } = useMemoryDashboard()
    await deleteNode('target-node')

    expect(fetch).toHaveBeenCalledWith('/api/v1/memory?nodeId=target-node', {
      method: 'DELETE',
    })
  })

  it('deleteNode on success updates local graph state', async () => {
    const nodeToDelete = makeNode({ id: 'del-node' })
    const keepNode = makeNode({ id: 'keep-node' })
    setupState({ graph: makeGraph([nodeToDelete, keepNode]) })

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { deleted: 'del-node' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const { deleteNode } = useMemoryDashboard()
    await deleteNode('del-node')

    // graph state (slot 0) should have been updated via setGraph
    const updatedGraph = mockStateStore[0] as LifeGraph
    expect(updatedGraph.nodes.find((n) => n.id === 'del-node')).toBeUndefined()
    expect(updatedGraph.nodes.find((n) => n.id === 'keep-node')).toBeDefined()
  })

  it('deleteNode on error sets error state', async () => {
    const node = makeNode({ id: 'node-x' })
    setupState({ graph: makeGraph([node]) })

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: false, error: 'Node not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const { deleteNode } = useMemoryDashboard()
    await deleteNode('node-x')

    // error state (slot 2) should be set
    expect(mockStateStore[2]).toBe('Node not found')
  })
})
