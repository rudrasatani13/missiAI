import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { PlanId } from '@/types/billing'

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

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

function getAtomicCounterNamespace(): DurableObjectNamespace | null {
  try {
    const { env } = getCloudflareContext()
    return ((env as Record<string, unknown>).ATOMIC_COUNTER as DurableObjectNamespace) ?? null
  } catch {
    return null
  }
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
