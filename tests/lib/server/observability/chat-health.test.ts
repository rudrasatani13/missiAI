import { beforeEach, describe, expect, it, vi, afterEach } from "vitest"
import {
  recordProviderOutcome,
  getProviderHealthSummary,
  isProviderExcluded,
  getAllProviderHealth,
  resetProviderHealthState,
} from "@/lib/server/observability/chat-health"

describe("chat-health", () => {
  beforeEach(() => {
    resetProviderHealthState()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("marks a provider healthy after successes", () => {
    recordProviderOutcome("vertex", true, 120)
    recordProviderOutcome("vertex", true, 130)
    const health = getProviderHealthSummary("vertex")
    expect(health.healthy).toBe(true)
    expect(health.consecutiveFailures).toBe(0)
    expect(health.p50LatencyMs).toBe(130)
  })

  it("tracks consecutive failures and auto-excludes", () => {
    const now = 1_000_000
    vi.setSystemTime(now)

    // 3 failures out of 10 requests = 30% failure rate, needs >= 3 failures
    for (let i = 0; i < 7; i++) {
      recordProviderOutcome("vertex", true, 100)
    }
    for (let i = 0; i < 3; i++) {
      recordProviderOutcome("vertex", false, 0)
    }

    const health = getProviderHealthSummary("vertex")
    expect(health.failureRate5m).toBe(0.3)
    expect(health.healthy).toBe(true) // exactly 30% threshold not exceeded

    // One more failure pushes over threshold
    recordProviderOutcome("vertex", false, 0)
    const degraded = getProviderHealthSummary("vertex")
    const excludedUntil = degraded.excludedUntil
    expect(degraded.healthy).toBe(false)
    expect(degraded.excludedUntil).toBeGreaterThan(now)
    expect(isProviderExcluded("vertex")).toBe(true)

    vi.setSystemTime(now + 30_000)
    const repeated = getProviderHealthSummary("vertex")
    expect(repeated.excludedUntil).toBe(excludedUntil)
    expect(repeated.healthy).toBe(false)
  })

  it("clears exclusion after the cooldown when no new outcomes arrive", () => {
    const now = 1_000_000
    vi.setSystemTime(now)

    for (let i = 0; i < 7; i++) {
      recordProviderOutcome("vertex", true, 100)
    }
    for (let i = 0; i < 4; i++) {
      recordProviderOutcome("vertex", false, 0)
    }

    const degraded = getProviderHealthSummary("vertex")
    expect(degraded.healthy).toBe(false)
    expect(isProviderExcluded("vertex")).toBe(true)

    vi.setSystemTime(degraded.excludedUntil + 1)

    const recovered = getProviderHealthSummary("vertex")
    expect(recovered.healthy).toBe(true)
    expect(recovered.excludedUntil).toBe(0)
    expect(isProviderExcluded("vertex")).toBe(false)
  })

  it("prunes old outcomes outside the 5-minute window", () => {
    const now = 1_000_000
    vi.setSystemTime(now)

    // Old failure outside window
    recordProviderOutcome("openai", false, 0)

    // Move forward past 5-minute window
    vi.setSystemTime(now + 6 * 60 * 1000)

    recordProviderOutcome("openai", true, 200)
    recordProviderOutcome("openai", true, 250)

    const health = getProviderHealthSummary("openai")
    expect(health.healthy).toBe(true)
    expect(health.consecutiveFailures).toBe(0)
  })

  it("computes p50, p95, p99 latency percentiles", () => {
    const latencies = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]
    for (const ms of latencies) {
      recordProviderOutcome("vertex", true, ms)
    }

    const health = getProviderHealthSummary("vertex")
    expect(health.p50LatencyMs).toBe(60)
    expect(health.p95LatencyMs).toBe(100)
    expect(health.p99LatencyMs).toBe(100)
  })

  it("returns empty metrics when no outcomes recorded", () => {
    const health = getProviderHealthSummary("vertex")
    expect(health.healthy).toBe(true)
    expect(health.p50LatencyMs).toBe(0)
    expect(health.p95LatencyMs).toBe(0)
    expect(health.p99LatencyMs).toBe(0)
    expect(health.failureRate5m).toBe(0)
  })

  it("returns all provider health via getAllProviderHealth", () => {
    recordProviderOutcome("vertex", true, 100)
    recordProviderOutcome("openai", false, 0)

    const all = getAllProviderHealth()
    expect(all.vertex).toBeDefined()
    expect(all.openai).toBeDefined()
    expect(all.vertex.healthy).toBe(true)
    expect(all.openai.healthy).toBe(true) // only 1 failure, not enough to exclude
  })
})
