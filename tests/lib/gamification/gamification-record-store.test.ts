import { describe, it, expect, vi, beforeEach } from 'vitest'
import { deleteHabitRecord, buildHabitRecordKey } from '@/lib/gamification/gamification-record-store'
import type { KVStore } from '@/types'

function createMockKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: vi.fn(async (key: string) => { store.delete(key) }),
    list: async ({ prefix = '', cursor, limit = 1000 } = {}) => {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = cursor ? Number(cursor) : 0
      const slice = keys.slice(start, start + limit)
      const next = start + slice.length
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      }
    },
  }
}

describe('gamification-record-store', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = createMockKV()
  })

  describe('deleteHabitRecord', () => {
    it('deletes the habit record with the correct key', async () => {
      const userId = 'user-123'
      const nodeId = 'node-456'
      const expectedKey = buildHabitRecordKey(userId, nodeId)

      // Pre-populate the store
      await kv.put(expectedKey, '{"some":"data"}')

      expect(await kv.get(expectedKey)).toBe('{"some":"data"}')

      await deleteHabitRecord(kv, userId, nodeId)

      // Verify the kv.delete method was called with the correct key
      expect(kv.delete).toHaveBeenCalledWith(expectedKey)

      // Verify the record was actually removed from the store
      expect(await kv.get(expectedKey)).toBeNull()
    })
  })
})
