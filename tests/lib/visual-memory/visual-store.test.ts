import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  addVisualRecord,
  getVisualRecords,
  deleteVisualRecord,
  getVisualRateLimit,
  incrementVisualRateLimit,
} from '@/lib/visual-memory/visual-store'
import type { KVStore } from '@/types'
import type { VisualMemoryRecord } from '@/types/visual-memory'

// ─── Mock KV ─────────────────────────────────────────────────────────────────

function makeKV(): KVStore & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

function makeRecord(nodeId: string, category: VisualMemoryRecord['category'] = 'general'): VisualMemoryRecord {
  return {
    nodeId,
    processedDate: '2026-04-14',
    category,
    summary: `Memory ${nodeId}`,
    userNote: null,
    tags: ['tag1', 'tag2'],
    createdAt: Date.now(),
  }
}

describe('visual-store', () => {
  let kv: ReturnType<typeof makeKV>

  beforeEach(() => {
    vi.clearAllMocks()
    kv = makeKV()
  })

  // ─── addVisualRecord ────────────────────────────────────────────────────────

  describe('addVisualRecord', () => {
    it('prepends new record (newest first) into an empty index', async () => {
      const record = makeRecord('node-1')
      await addVisualRecord(kv, 'user-1', record)

      const stored = JSON.parse(kv.store.get('visual-memory:index:user-1') ?? '[]')
      expect(stored).toHaveLength(1)
      expect(stored[0].nodeId).toBe('node-1')
    })

    it('prepends so newest record is first', async () => {
      const r1 = makeRecord('node-1')
      const r2 = makeRecord('node-2')
      await addVisualRecord(kv, 'user-1', r1)
      await addVisualRecord(kv, 'user-1', r2)

      const stored = JSON.parse(kv.store.get('visual-memory:index:user-1') ?? '[]')
      expect(stored[0].nodeId).toBe('node-2') // newest first
      expect(stored[1].nodeId).toBe('node-1')
    })

    it('prevents duplicate nodeId entries by removing old ones', async () => {
      const r1 = makeRecord('node-1')
      const r2 = makeRecord('node-2')
      const r1Updated = { ...makeRecord('node-1'), summary: 'Updated' }

      await addVisualRecord(kv, 'user-1', r1)
      await addVisualRecord(kv, 'user-1', r2)
      await addVisualRecord(kv, 'user-1', r1Updated) // Should push to top and replace old

      const stored = JSON.parse(kv.store.get('visual-memory:index:user-1') ?? '[]')
      expect(stored).toHaveLength(2)
      expect(stored[0].nodeId).toBe('node-1')
      expect(stored[0].summary).toBe('Updated')
      expect(stored[1].nodeId).toBe('node-2')
    })

    it('trims to 100 records max when over limit', async () => {
      // Pre-fill 100 records
      const existing = Array.from({ length: 100 }, (_, i) => makeRecord(`node-old-${i}`))
      kv.store.set('visual-memory:index:user-1', JSON.stringify(existing))

      await addVisualRecord(kv, 'user-1', makeRecord('node-new'))

      const stored = JSON.parse(kv.store.get('visual-memory:index:user-1') ?? '[]')
      expect(stored).toHaveLength(100)
      expect(stored[0].nodeId).toBe('node-new') // new is first
      expect(stored[99].nodeId).toBe('node-old-98') // oldest dropped
    })
  })

  // ─── getVisualRecords ───────────────────────────────────────────────────────

  describe('getVisualRecords', () => {
    it('returns empty array when no data exists', async () => {
      const records = await getVisualRecords(kv, 'user-empty')
      expect(records).toEqual([])
    })

    it('returns up to limit records', async () => {
      const data = Array.from({ length: 30 }, (_, i) => makeRecord(`node-${i}`))
      kv.store.set('visual-memory:index:user-1', JSON.stringify(data))

      const records = await getVisualRecords(kv, 'user-1', 10)
      expect(records).toHaveLength(10)
    })

    it('clamps limit to max 100', async () => {
      const data = Array.from({ length: 80 }, (_, i) => makeRecord(`node-${i}`))
      kv.store.set('visual-memory:index:user-1', JSON.stringify(data))

      const records = await getVisualRecords(kv, 'user-1', 999)
      expect(records).toHaveLength(80) // only 80 exist
    })

    it('returns empty array on corrupt JSON', async () => {
      kv.store.set('visual-memory:index:user-1', 'not-valid-json')
      const records = await getVisualRecords(kv, 'user-1')
      expect(records).toEqual([])
    })

    it('deduplicates existing corrupted duplicate records on read', async () => {
      const data = [makeRecord('node-1'), makeRecord('node-2'), makeRecord('node-1')]
      kv.store.set('visual-memory:index:user-1', JSON.stringify(data))

      const records = await getVisualRecords(kv, 'user-1')
      expect(records).toHaveLength(2)
      expect(records[0].nodeId).toBe('node-1')
      expect(records[1].nodeId).toBe('node-2')
    })
  })

  // ─── deleteVisualRecord ─────────────────────────────────────────────────────

  describe('deleteVisualRecord', () => {
    it('removes record with matching nodeId', async () => {
      const data = [makeRecord('node-1'), makeRecord('node-2'), makeRecord('node-3')]
      kv.store.set('visual-memory:index:user-1', JSON.stringify(data))

      await deleteVisualRecord(kv, 'user-1', 'node-2')

      const stored = JSON.parse(kv.store.get('visual-memory:index:user-1') ?? '[]')
      expect(stored).toHaveLength(2)
      expect(stored.find((r: VisualMemoryRecord) => r.nodeId === 'node-2')).toBeUndefined()
    })

    it('does nothing (no throw) when nodeId not found', async () => {
      const data = [makeRecord('node-1')]
      kv.store.set('visual-memory:index:user-1', JSON.stringify(data))

      await expect(deleteVisualRecord(kv, 'user-1', 'does-not-exist')).resolves.not.toThrow()

      // Record list unchanged
      const stored = JSON.parse(kv.store.get('visual-memory:index:user-1') ?? '[]')
      expect(stored).toHaveLength(1)
    })

    it('does nothing when index does not exist', async () => {
      await expect(deleteVisualRecord(kv, 'user-no-data', 'any-id')).resolves.not.toThrow()
    })
  })

  // ─── Rate limit ─────────────────────────────────────────────────────────────

  describe('rate limit', () => {
    it('returns 0 when no rate limit entry exists', async () => {
      const count = await getVisualRateLimit(kv, 'user-fresh')
      expect(count).toBe(0)
    })

    it('increment and read work correctly', async () => {
      await incrementVisualRateLimit(kv, 'user-1')
      await incrementVisualRateLimit(kv, 'user-1')

      const count = await getVisualRateLimit(kv, 'user-1')
      expect(count).toBe(2)
    })

    it('returns 0 on corrupt rate limit value', async () => {
      const today = new Date().toISOString().slice(0, 10)
      kv.store.set(`ratelimit:visual-memory:user-1:${today}`, 'not-a-number')
      const count = await getVisualRateLimit(kv, 'user-1')
      expect(count).toBe(0)
    })

    it('calls put with expirationTtl', async () => {
      await incrementVisualRateLimit(kv, 'user-1')
      expect(kv.put).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:visual-memory:user-1:'),
        '1',
        { expirationTtl: 86400 },
      )
    })
  })
})
