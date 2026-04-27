import { getCloudflareAtomicCounterBinding, type CloudflareDurableObjectNamespace } from '@/lib/server/platform/bindings'
import type { PlanId } from '@/types/billing'

interface AtomicCounterResult {
  allowed: boolean
  count: number
  remaining: number
}

interface AtomicVoiceResult {
  allowed: boolean
  usedSeconds: number
  limitSeconds: number
  remainingSeconds: number
  voiceInteractions: number
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

export async function checkVoiceUsageAtomic(
  userId: string,
  date: string,
  planId: PlanId,
  limitSeconds: number,
): Promise<AtomicVoiceResult | null> {
  return callAtomicCounter<AtomicVoiceResult>(`voice:${userId}:${date}`, '/voice/check', {
    userId,
    date,
    planId,
    limitSeconds,
  })
}

export async function checkAndIncrementVoiceUsageAtomic(
  userId: string,
  date: string,
  planId: PlanId,
  limitSeconds: number,
  addSeconds: number,
  ttlSeconds: number,
): Promise<AtomicVoiceResult | null> {
  return callAtomicCounter<AtomicVoiceResult>(`voice:${userId}:${date}`, '/voice/check-increment', {
    userId,
    date,
    planId,
    limitSeconds,
    addSeconds,
    ttlSeconds,
  })
}
