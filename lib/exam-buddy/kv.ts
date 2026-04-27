import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import type { KVStore } from '@/types'

type GlobalWithExamBuddyKV = typeof globalThis & {
  __MISSI_EXAM_BUDDY_LOCAL_STORE__?: Map<string, string>
}

function getLocalStore() {
  const globalScope = globalThis as GlobalWithExamBuddyKV
  if (!globalScope.__MISSI_EXAM_BUDDY_LOCAL_STORE__) {
    globalScope.__MISSI_EXAM_BUDDY_LOCAL_STORE__ = new Map<string, string>()
  }
  return globalScope.__MISSI_EXAM_BUDDY_LOCAL_STORE__
}

const localKV = {
  async get<T>(key: string, options?: { type: 'json' }) {
    const value = getLocalStore().get(key) ?? null
    if (value === null) return null
    if (options?.type === 'json') {
      try {
        return JSON.parse(value) as T
      } catch {
        return null
      }
    }
    return value
  },
  async put(key: string, value: string) {
    getLocalStore().set(key, value)
  },
  async delete(key: string) {
    getLocalStore().delete(key)
  },
} as KVStore

export function getExamBuddyKV(): KVStore | null {
  const kv = getCloudflareKVBinding()
  if (kv) return kv
  if (process.env.NODE_ENV !== 'production') return localKV
  return null
}
