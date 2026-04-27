/**
 * Chat Provider Health Tracking
 *
 * In-memory ring-buffer per provider for request outcomes. Computes:
 *   - 5-minute failure rate (auto-exclusion if > 30%)
 *   - p50 / p95 / p99 latency percentiles
 *   - Consecutive failure count
 *
 * Used by provider-router for fallback decisions and by the health
 * endpoint for status reporting.
 */

export interface RequestOutcome {
  timestamp: number
  success: boolean
  latencyMs: number
}

export interface ProviderHealth {
  name: string
  healthy: boolean
  lastCheckedAt: number
  latencyMs: number
  consecutiveFailures: number
  failureRate5m: number
  p50LatencyMs: number
  p95LatencyMs: number
  p99LatencyMs: number
  lastFailureAt: number
  excludedUntil: number
}

const RING_BUFFER_SIZE = 50
const AUTO_EXCLUSION_WINDOW_MS = 5 * 60 * 1000 // 5 minutes
const AUTO_EXCLUSION_THRESHOLD = 0.3 // 30%
const MIN_FAILURES_FOR_EXCLUSION = 3

/** Mutable in-memory store — lost on isolate restart (intentional). */
const outcomes = new Map<string, RequestOutcome[]>()
const exclusions = new Map<string, number>()

function getBuffer(provider: string): RequestOutcome[] {
  if (!outcomes.has(provider)) {
    outcomes.set(provider, [])
  }
  return outcomes.get(provider)!
}

function pruneOld(buffer: RequestOutcome[], now: number): RequestOutcome[] {
  const cutoff = now - AUTO_EXCLUSION_WINDOW_MS
  return buffer.filter((o) => o.timestamp > cutoff)
}

function computePercentiles(values: number[]): {
  p50: number
  p95: number
  p99: number
} {
  if (values.length === 0) return { p50: 0, p95: 0, p99: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const idx = (p: number) => Math.min(sorted.length - 1, Math.floor(sorted.length * p))
  return {
    p50: sorted[idx(0.5)],
    p95: sorted[idx(0.95)],
    p99: sorted[idx(0.99)],
  }
}

/**
 * Record a request outcome for a provider.
 */
export function recordProviderOutcome(
  provider: string,
  success: boolean,
  latencyMs: number,
): void {
  const buffer = getBuffer(provider)
  buffer.push({ timestamp: Date.now(), success, latencyMs })
  if (buffer.length > RING_BUFFER_SIZE) {
    buffer.shift()
  }
}

/**
 * Compute the current health summary for a provider from the ring buffer.
 */
export function getProviderHealthSummary(provider: string): ProviderHealth {
  const now = Date.now()
  const rawBuffer = getBuffer(provider)
  const buffer = pruneOld(rawBuffer, now)
  if (buffer.length !== rawBuffer.length) {
    outcomes.set(provider, buffer)
  }
  const successOutcomes = buffer.filter((o) => o.success)
  const failureOutcomes = buffer.filter((o) => !o.success)
  const failureRate = buffer.length > 0 ? failureOutcomes.length / buffer.length : 0

  const latencies = successOutcomes.map((o) => o.latencyMs)
  const percentiles = computePercentiles(latencies)

  const lastFailureAt =
    failureOutcomes.length > 0
      ? Math.max(...failureOutcomes.map((o) => o.timestamp))
      : 0

  const lastCheckedAt = buffer.length > 0
    ? Math.max(...buffer.map((o) => o.timestamp))
    : 0

  const recentFailures = failureOutcomes.filter(
    (o) => o.timestamp > now - 60_000,
  ).length

  const shouldExclude =
    failureRate > AUTO_EXCLUSION_THRESHOLD &&
    failureOutcomes.length >= MIN_FAILURES_FOR_EXCLUSION

  let excludedUntil = exclusions.get(provider) ?? 0
  if (excludedUntil <= now) {
    exclusions.delete(provider)
    excludedUntil = 0
  }
  if (excludedUntil === 0 && shouldExclude) {
    excludedUntil = now + AUTO_EXCLUSION_WINDOW_MS
    exclusions.set(provider, excludedUntil)
  }

  return {
    name: provider,
    healthy: excludedUntil === 0,
    lastCheckedAt,
    latencyMs: percentiles.p50,
    consecutiveFailures: recentFailures,
    failureRate5m: failureRate,
    p50LatencyMs: percentiles.p50,
    p95LatencyMs: percentiles.p95,
    p99LatencyMs: percentiles.p99,
    lastFailureAt,
    excludedUntil,
  }
}

/**
 * Whether a provider is currently auto-excluded from rotation.
 */
export function isProviderExcluded(provider: string): boolean {
  const summary = getProviderHealthSummary(provider)
  return Date.now() < summary.excludedUntil
}

/**
 * Health summaries for all tracked providers.
 */
export function getAllProviderHealth(): Record<string, ProviderHealth> {
  const result: Record<string, ProviderHealth> = {}
  for (const provider of outcomes.keys()) {
    result[provider] = getProviderHealthSummary(provider)
  }
  return result
}

/**
 * Reset all in-memory health state. Useful in tests.
 */
export function resetProviderHealthState(): void {
  outcomes.clear()
  exclusions.clear()
}
