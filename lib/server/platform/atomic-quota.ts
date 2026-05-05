import { getCloudflareAtomicCounterBinding, type CloudflareDurableObjectNamespace } from '@/lib/server/platform/bindings'

interface AtomicCounterResult {
  allowed: boolean
  count: number
  remaining: number
}

function getAtomicCounterNamespace(): CloudflareDurableObjectNamespace | null {
  return getCloudflareAtomicCounterBinding()
}

async function callAtomicCounter<T>(name: string, path: string, body: unknown): Promise<T | null> {
  const namespace = getAtomicCounterNamespace()
  if (!namespace) return null

  try {
    const stub = namespace.get(namespace.idFromName(name))
    const response = await stub.fetch(`https://atomic${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) return null
    return await response.json() as T
  } catch {
    return null
  }
}

export async function checkAndIncrementAtomicCounter(
  name: string,
  limit: number,
  ttlSeconds: number,
): Promise<AtomicCounterResult | null> {
  return callAtomicCounter<AtomicCounterResult>(name, '/counter/check-increment', {
    limit,
    ttlSeconds,
  })
}

export async function checkAtomicCounter(
  name: string,
  limit: number,
): Promise<AtomicCounterResult | null> {
  return callAtomicCounter<AtomicCounterResult>(name, '/counter/check', {
    limit,
  })
}

export async function decrementAtomicCounter(
  name: string,
  limit: number,
  amount = 1,
): Promise<AtomicCounterResult | null> {
  return callAtomicCounter<AtomicCounterResult>(name, '/counter/decrement', {
    limit,
    amount,
  })
}
