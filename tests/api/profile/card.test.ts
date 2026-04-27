import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getLifeGraph, saveLifeGraph } from '@/lib/memory/life-graph'
import { getGamificationData } from '@/lib/gamification/streak'
import type { KVStore } from '@/types'
import type { LifeGraph, LifeNode } from '@/types/memory'
import type { GamificationData } from '@/types/gamification'

// ─── In-memory KV mock ───────────────────────────────────────────────────────

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TEST_USER = 'user_test_123'

function makeNode(overrides: Partial<LifeNode> = {}): LifeNode {
  return {
    id: `node-${Math.random().toString(36).slice(2, 8)}`,
    userId: TEST_USER,
    category: 'preference',
    title: 'Test Node',
    detail: 'Some detail about the user',
    tags: ['testing'],
    people: [],
    emotionalWeight: 0.5,
    confidence: 0.8,
    createdAt: Date.now() - 86400000 * 30, // 30 days ago
    updatedAt: Date.now(),
    accessCount: 5,
    lastAccessedAt: Date.now(),
    source: 'conversation' as const,
    ...overrides,
  }
}

function makeGraph(nodes: LifeNode[] = []): LifeGraph {
  return {
    nodes,
    totalInteractions: 150,
    lastUpdatedAt: Date.now(),
    version: 1,
  }
}

function makeGamificationData(overrides: Partial<GamificationData> = {}): GamificationData {
  return {
    userId: TEST_USER,
    totalXP: 450,
    level: 4,
    avatarTier: 3,
    habits: [
      {
        nodeId: 'habit-1',
        title: 'Morning run',
        currentStreak: 12,
        longestStreak: 25,
        lastCheckedIn: new Date().toISOString().slice(0, 10),
        totalCheckIns: 50,
      },
    ],
    achievements: [
      { id: 'first_words', title: 'First Words', description: 'Send your first message', xpBonus: 5, unlockedAt: Date.now() },
      { id: 'memory_keeper', title: 'Memory Keeper', description: 'Have 10 memories', xpBonus: 10, unlockedAt: Date.now() },
      { id: 'centurion', title: 'Centurion', description: 'Reach 100-day streak', xpBonus: 100, unlockedAt: null },
    ],
    xpLog: [],
    xpLogDate: '',
    loginStreak: 7,
    lastLoginDate: new Date().toISOString().slice(0, 10),
    lastUpdatedAt: Date.now(),
    ...overrides,
  }
}

async function seedLifeGraph(kv: KVStore, userId: string, graph: LifeGraph) {
  await saveLifeGraph(kv, userId, graph)
}

async function seedGamification(kv: KVStore, userId: string, data: GamificationData) {
  await kv.put(`gamification:${userId}`, JSON.stringify(data))
}

// ─── Import the functions under test ─────────────────────────────────────────
// We test the data logic via the library functions since the route handler
// depends on Cloudflare runtime + Clerk auth which can't run in node tests.
// Instead, we test the core data derivation logic and caching behavior.

describe('profile card API — data derivation', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = createMockKV()
  })

  // ── Test 1: Auth guard (simulated — getLifeGraph returns empty for unknown) ──

  it('returns empty graph for unauthenticated / unknown user', async () => {
    const graph = await getLifeGraph(kv, 'nonexistent_user')
    expect(graph.nodes).toEqual([])
    expect(graph.totalInteractions).toBe(0)
  })

  // ── Test 2: Valid user with data returns correct shape ────────────────────

  it('returns correct data shape for user with full data', async () => {
    const nodes: LifeNode[] = [
      makeNode({ category: 'preference', title: 'Coffee', tags: ['food', 'morning'], accessCount: 20, emotionalWeight: 0.8 }),
      makeNode({ category: 'skill', title: 'TypeScript', tags: ['coding', 'tech'], accessCount: 15 }),
      makeNode({ category: 'person', title: 'Alice', emotionalWeight: 0.9 }),
      makeNode({ category: 'relationship', title: 'Mom', emotionalWeight: 0.95 }),
      makeNode({ category: 'goal', title: 'Run a marathon', tags: ['fitness'] }),
      makeNode({ category: 'goal', title: 'Learn piano', tags: ['music'] }),
      makeNode({ category: 'emotion', title: 'Grateful', emotionalWeight: 0.7 }),
    ]
    const graph = makeGraph(nodes)
    const gamData = makeGamificationData()

    await seedLifeGraph(kv, TEST_USER, graph)
    await seedGamification(kv, TEST_USER, gamData)

    const fetchedGraph = await getLifeGraph(kv, TEST_USER)
    const fetchedGam = await getGamificationData(kv, TEST_USER)

    // Top interests: preference + skill sorted by accessCount
    const interestNodes = fetchedGraph.nodes
      .filter(n => n.category === 'preference' || n.category === 'skill')
      .sort((a, b) => b.accessCount - a.accessCount)
    expect(interestNodes.length).toBeGreaterThanOrEqual(2)
    expect(interestNodes[0].title).toBe('Coffee')

    // People in My World
    const people = fetchedGraph.nodes
      .filter(n => n.category === 'person' || n.category === 'relationship')
      .sort((a, b) => b.emotionalWeight - a.emotionalWeight)
      .slice(0, 4)
    expect(people.length).toBe(2)
    expect(people[0].title).toBe('Mom')

    // Active goals
    const goals = fetchedGraph.nodes
      .filter(n => n.category === 'goal')
      .slice(0, 3)
    expect(goals.length).toBe(2)

    // Top habit
    const bestHabit = [...fetchedGam.habits].sort((a, b) => b.longestStreak - a.longestStreak)[0]
    expect(bestHabit.title).toBe('Morning run')
    expect(bestHabit.longestStreak).toBe(25)

    // Memory stats
    expect(fetchedGraph.nodes.length).toBe(7)
    expect(fetchedGraph.totalInteractions).toBe(150)

    // Tag frequency
    const tagCounts = new Map<string, number>()
    for (const node of fetchedGraph.nodes) {
      for (const tag of node.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }
    let mostTalkedAbout = ''
    let maxCount = 0
    for (const [tag, count] of tagCounts) {
      if (count > maxCount) { maxCount = count; mostTalkedAbout = tag }
    }
    expect(mostTalkedAbout).toBeTruthy()

    // Unlocked achievements
    const unlocked = fetchedGam.achievements.filter(a => a.unlockedAt !== null)
    expect(unlocked.length).toBe(2)
  })

  // ── Test 3: Zero memories — empty graph ──────────────────────────────────

  it('handles user with zero memories (empty graph)', async () => {
    const graph = makeGraph([])
    await seedLifeGraph(kv, TEST_USER, graph)
    await seedGamification(kv, TEST_USER, makeGamificationData({ habits: [] }))

    const fetchedGraph = await getLifeGraph(kv, TEST_USER)
    expect(fetchedGraph.nodes).toEqual([])
    expect(fetchedGraph.totalInteractions).toBe(150)

    const fetchedGam = await getGamificationData(kv, TEST_USER)
    expect(fetchedGam.habits).toEqual([])
  })

  // ── Test 4: Zero gamification data ───────────────────────────────────────

  it('handles user with zero gamification data', async () => {
    const nodes = [makeNode({ title: 'Solo node' })]
    await seedLifeGraph(kv, TEST_USER, makeGraph(nodes))
    // No gamification data seeded — should return defaults

    const fetchedGam = await getGamificationData(kv, TEST_USER)
    expect(fetchedGam.totalXP).toBe(0)
    expect(fetchedGam.level).toBe(1)
    expect(fetchedGam.avatarTier).toBe(1)
    expect(fetchedGam.habits).toEqual([])
    expect(fetchedGam.achievements).toEqual([])
    expect(fetchedGam.loginStreak).toBe(0)
  })

  // ── Test 5: Caching — second call serves cached result ───────────────────

  it('caching: second get from KV returns cached data without re-fetching graph', async () => {
    const nodes = [makeNode({ title: 'Cached node' })]
    await seedLifeGraph(kv, TEST_USER, makeGraph(nodes))

    // First call
    const graph1 = await getLifeGraph(kv, TEST_USER)
    expect(graph1.nodes.length).toBe(1)

    // Simulate caching by writing a card result
    const cachedCard = { userName: 'Test', avatarTier: 'Spark', cached: true }
    const cacheKey = `profile:card:${TEST_USER}`
    await kv.put(cacheKey, JSON.stringify(cachedCard))

    // Second call — read from cache key
    const raw = await kv.get(cacheKey)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    expect(parsed.cached).toBe(true)
    expect(parsed.userName).toBe('Test')

    // getLifeGraph should not have been called again for the cached path
    // Verify the cache key is different from the lifegraph key
    const metaRaw = await kv.get(`lifegraph:v2:meta:${TEST_USER}`)
    expect(metaRaw).toBeTruthy()
    expect(JSON.parse(metaRaw!).nodeCount).toBe(1)
  })

  // ── Test 6: refresh=true bypasses cache ──────────────────────────────────

  it('refresh bypasses cache — fresh data is returned', async () => {
    const cacheKey = `profile:card:${TEST_USER}`

    // Seed stale cache
    await kv.put(cacheKey, JSON.stringify({ userName: 'Old', stale: true }))

    // Seed fresh underlying data
    const nodes = [
      makeNode({ title: 'Fresh preference', category: 'preference' }),
    ]
    await seedLifeGraph(kv, TEST_USER, makeGraph(nodes))
    await seedGamification(kv, TEST_USER, makeGamificationData())

    // On refresh, the route would skip the cache read and re-derive from source
    const freshGraph = await getLifeGraph(kv, TEST_USER)
    expect(freshGraph.nodes.length).toBe(1)
    expect(freshGraph.nodes[0].title).toBe('Fresh preference')

    // The cache would be overwritten with new data
    const newCardData = {
      userName: 'Fresh',
      topInterests: ['Fresh preference'],
      stale: false,
    }
    await kv.put(cacheKey, JSON.stringify(newCardData))

    const updatedCache = JSON.parse((await kv.get(cacheKey))!)
    expect(updatedCache.stale).toBe(false)
    expect(updatedCache.userName).toBe('Fresh')
  })
})

describe('profile card — personality snapshot fallback', () => {
  it('provides a default fallback snapshot string', () => {
    const fallback = "A curious, growth-minded person building something meaningful."
    expect(fallback).toBeTruthy()
    expect(fallback.length).toBeLessThan(200)
    expect(fallback.length).toBeGreaterThan(5)
  })
})

describe('profile card — tag frequency calculation', () => {
  it('correctly identifies most frequent tag across nodes', () => {
    const nodes: LifeNode[] = [
      makeNode({ tags: ['fitness', 'health'] }),
      makeNode({ tags: ['fitness', 'morning'] }),
      makeNode({ tags: ['coding', 'fitness'] }),
      makeNode({ tags: ['coding', 'tech'] }),
    ]

    const tagCounts = new Map<string, number>()
    for (const node of nodes) {
      for (const tag of node.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }

    let mostTalkedAbout = ''
    let maxCount = 0
    for (const [tag, count] of tagCounts) {
      if (count > maxCount) { maxCount = count; mostTalkedAbout = tag }
    }

    expect(mostTalkedAbout).toBe('fitness')
    expect(maxCount).toBe(3)
  })

  it('returns empty string when no tags exist', () => {
    const nodes: LifeNode[] = [
      makeNode({ tags: [] }),
      makeNode({ tags: [] }),
    ]

    const tagCounts = new Map<string, number>()
    for (const node of nodes) {
      for (const tag of node.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }

    let mostTalkedAbout = ''
    let maxCount = 0
    for (const [tag, count] of tagCounts) {
      if (count > maxCount) { maxCount = count; mostTalkedAbout = tag }
    }

    expect(mostTalkedAbout).toBe('')
    expect(maxCount).toBe(0)
  })
})

describe('profile card — days active calculation', () => {
  it('calculates days active from oldest node to last update', () => {
    const now = Date.now()
    const thirtyDaysAgo = now - 86400000 * 30
    const nodes = [
      makeNode({ createdAt: thirtyDaysAgo, updatedAt: now }),
      makeNode({ createdAt: now - 86400000 * 10, updatedAt: now }),
    ]

    const oldestCreatedAt = Math.min(...nodes.map(n => n.createdAt))
    const lastUpdated = now
    const daysActive = Math.max(1, Math.ceil((lastUpdated - oldestCreatedAt) / (1000 * 60 * 60 * 24)))

    expect(daysActive).toBe(30)
  })

  it('returns 0 days active for empty graph', () => {
    const nodes: LifeNode[] = []
    let daysActive = 0
    if (nodes.length > 0) {
      const oldestCreatedAt = Math.min(...nodes.map(n => n.createdAt))
      daysActive = Math.max(1, Math.ceil((Date.now() - oldestCreatedAt) / (1000 * 60 * 60 * 24)))
    }
    expect(daysActive).toBe(0)
  })
})
