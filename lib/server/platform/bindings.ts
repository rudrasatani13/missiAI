import { getCloudflareContext } from "@opennextjs/cloudflare"
import type { KVStore } from "@/types"

export interface CloudflareDurableObjectId {}

export interface CloudflareD1ExecResult {
  count: number
  duration: number
}

export interface CloudflareD1Result<T = Record<string, unknown>> {
  success: boolean
  results?: T[]
  meta?: Record<string, unknown>
}

export interface CloudflareD1PreparedStatement {
  bind(...values: unknown[]): CloudflareD1PreparedStatement
  first<T = Record<string, unknown>>(columnName?: string): Promise<T | null>
  run<T = Record<string, unknown>>(): Promise<CloudflareD1Result<T>>
  all<T = Record<string, unknown>>(): Promise<CloudflareD1Result<T>>
  raw<T = unknown[]>(): Promise<T[]>
}

export interface CloudflareD1Database {
  prepare(query: string): CloudflareD1PreparedStatement
  batch<T = Record<string, unknown>>(statements: CloudflareD1PreparedStatement[]): Promise<Array<CloudflareD1Result<T>>>
  exec(query: string): Promise<CloudflareD1ExecResult>
}

export interface CloudflareDurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface CloudflareDurableObjectNamespace {
  idFromName(name: string): CloudflareDurableObjectId
  get(id: CloudflareDurableObjectId): CloudflareDurableObjectStub
}

type CloudflareContextLike = {
  env?: Record<string, unknown>
  ctx?: { waitUntil?: (promise: Promise<unknown>) => void }
}

const CLOUDFLARE_D1_BINDING_NAMES = ["MISSI_DB", "MISSI_PRIMARY_DB", "DB"] as const

function getFirstBinding<T>(env: Record<string, unknown> | null, bindingNames: readonly string[]): T | null {
  if (!env) return null
  for (const name of bindingNames) {
    const binding = env[name]
    if (binding) return binding as T
  }
  return null
}

export function getCloudflareBindings(): Record<string, unknown> | null {
  try {
    const { env } = getCloudflareContext() as unknown as CloudflareContextLike
    return (env as Record<string, unknown>) ?? null
  } catch {
    return null
  }
}

export function getCloudflareKVBinding(): KVStore | null {
  const env = getCloudflareBindings()
  return (env?.MISSI_MEMORY as KVStore) ?? null
}

export function getCloudflareD1Binding(): CloudflareD1Database | null {
  return getFirstBinding<CloudflareD1Database>(getCloudflareBindings(), CLOUDFLARE_D1_BINDING_NAMES)
}

export function getCloudflareAtomicCounterBinding(): CloudflareDurableObjectNamespace | null {
  const env = getCloudflareBindings()
  return (env?.ATOMIC_COUNTER as CloudflareDurableObjectNamespace) ?? null
}

export function getCloudflareExecutionContext(): { waitUntil: (promise: Promise<unknown>) => void } | null {
  try {
    const { ctx } = getCloudflareContext() as unknown as CloudflareContextLike
    return typeof ctx?.waitUntil === "function" ? { waitUntil: ctx.waitUntil } : null
  } catch {
    return null
  }
}
