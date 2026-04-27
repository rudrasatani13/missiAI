import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { CloudflareD1Database } from "@/lib/server/platform/bindings"
import type { KVStore } from "@/types"

type CloudflareContextLike = {
  env?: Record<string, unknown>
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

export async function getCloudflareBindingsAsync(): Promise<Record<string, unknown> | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare")
    const { env } = getCloudflareContext() as unknown as CloudflareContextLike
    return (env as Record<string, unknown>) ?? null
  } catch {
    return null
  }
}

export async function getCloudflareKVBindingAsync(): Promise<KVStore | null> {
  const env = await getCloudflareBindingsAsync()
  return (env?.MISSI_MEMORY as KVStore) ?? null
}

export async function getCloudflareD1BindingAsync(): Promise<CloudflareD1Database | null> {
  return getFirstBinding<CloudflareD1Database>(await getCloudflareBindingsAsync(), CLOUDFLARE_D1_BINDING_NAMES)
}

export async function getCloudflareVectorizeEnvAsync(): Promise<VectorizeEnv | null> {
  const env = await getCloudflareBindingsAsync()
  const lifeGraph = (env?.LIFE_GRAPH ?? env?.VECTORIZE_INDEX) as VectorizeEnv["LIFE_GRAPH"] | undefined
  if (!lifeGraph) return null
  return { LIFE_GRAPH: lifeGraph }
}
