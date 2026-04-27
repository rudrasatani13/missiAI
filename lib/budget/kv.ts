import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import type { KVStore } from '@/types'

type GlobalWithBudgetKV = typeof globalThis & {
  __MISSI_BUDGET_LOCAL_STORE__?: Map<string, string>
}

function getLocalStore() {
  const globalScope = globalThis as GlobalWithBudgetKV
  if (!globalScope.__MISSI_BUDGET_LOCAL_STORE__) {
    globalScope.__MISSI_BUDGET_LOCAL_STORE__ = new Map<string, string>()
  }
  return globalScope.__MISSI_BUDGET_LOCAL_STORE__
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
  async put(key: string, value: string, _opts?: { expirationTtl?: number }) {
    getLocalStore().set(key, value)
  },
  async delete(key: string) {
    getLocalStore().delete(key)
  },
} as KVStore

export function getBudgetKV(): KVStore | null {
  const kv = getCloudflareKVBinding()
  if (kv) return kv
  if (process.env.NODE_ENV !== 'production') return localKV
  return null
}
