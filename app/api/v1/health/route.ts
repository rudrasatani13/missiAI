import { NextRequest } from "next/server"
import {
  checkProviderHealth,
  getProviderHealthSnapshot,
  type ProviderHealthStatus,
} from "@/lib/ai/providers/router"
import {
  getCloudflareD1Binding,
  getCloudflareKVBinding,
  getCloudflareVectorizeEnv,
  getCloudflareAtomicCounterBinding,
} from "@/lib/server/platform/bindings"
import { envExists } from "@/lib/server/platform/env"
import { isAdminUser } from "@/lib/server/security/admin-auth"
import {
  checkRateLimit,
  rateLimitExceededResponse,
} from "@/lib/server/security/rate-limiter"
import { log } from "@/lib/server/observability/logger"

// ─── Check result type ────────────────────────────────────────────────────────

interface CheckResult {
  status: "ok" | "degraded" | "not_configured" | "error" | "skipped"
  latencyMs: number
}

// ─── Deep-health access control ───────────────────────────────────────────────
//
// Deep probes reveal KV / D1 / Vectorize / Durable Object / AI provider
// topology and may trigger live backend calls. They are gated behind either:
//
//   A) A static internal token (HEALTH_INTERNAL_TOKEN env var, ≥ 16 chars)
//      sent as `Authorization: Bearer <token>` — for uptime monitors /
//      Cloudflare scheduled checks that cannot carry a Clerk session.
//   B) A Clerk admin session (role === 'admin' or ADMIN_USER_ID match).
//
// Public callers with no deep/probe params get only `{ ok: true }`.
// Public callers who include deep/probe params without valid auth get 401.

async function resolveDeepHealthCaller(
  req: NextRequest,
): Promise<{ authorized: boolean; rateLimitId: string }> {
  // Option A: static internal token
  const internalToken = process.env.HEALTH_INTERNAL_TOKEN
  if (internalToken && internalToken.length >= 16) {
    const authHeader = req.headers.get("authorization") ?? ""
    if (authHeader === `Bearer ${internalToken}`) {
      return { authorized: true, rateLimitId: "__health_internal__" }
    }
  }

  // Option B: Clerk admin session
  try {
    const { auth } = await import("@clerk/nextjs/server")
    const clerkAuth = await auth()
    const { userId } = clerkAuth
    if (!userId) return { authorized: false, rateLimitId: "" }
    if (!isAdminUser(clerkAuth, userId)) return { authorized: false, rateLimitId: "" }
    return { authorized: true, rateLimitId: userId }
  } catch {
    return { authorized: false, rateLimitId: "" }
  }
}

function hasHealthProbe(req: NextRequest, ...names: string[]): boolean {
  if (req.nextUrl.searchParams.get("deep") === "true") {
    return true
  }

  const probes = new Set(
    req.nextUrl.searchParams
      .getAll("probe")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )

  return probes.has("all") || names.some((name) => probes.has(name))
}

async function checkKV(): Promise<CheckResult> {
  const start = Date.now()
  try {
    const kv = getCloudflareKVBinding()
    if (!kv) {
      return { status: "not_configured", latencyMs: Date.now() - start }
    }
    // Lightweight ping — get a known key (likely empty)
    await kv.get("__health_check__")
    return { status: "ok", latencyMs: Date.now() - start }
  } catch {
    return { status: "error", latencyMs: Date.now() - start }
  }
}

async function checkD1(): Promise<CheckResult> {
  const start = Date.now()
  try {
    const db = getCloudflareD1Binding()
    if (!db) {
      return { status: "not_configured", latencyMs: Date.now() - start }
    }
    const result = await db.prepare("SELECT 1 AS ok").first<number>("ok")
    return result === 1
      ? { status: "ok", latencyMs: Date.now() - start }
      : { status: "error", latencyMs: Date.now() - start }
  } catch {
    return { status: "error", latencyMs: Date.now() - start }
  }
}

async function checkVectorize(probeLive: boolean): Promise<CheckResult> {
  const start = Date.now()
  try {
    const env = getCloudflareVectorizeEnv()
    if (!env) {
      return { status: "not_configured", latencyMs: Date.now() - start }
    }
    if (!probeLive) {
      return { status: "skipped", latencyMs: Date.now() - start }
    }
    await env.LIFE_GRAPH.query(new Array(768).fill(0), { topK: 1 })
    return { status: "ok", latencyMs: Date.now() - start }
  } catch {
    return { status: "error", latencyMs: Date.now() - start }
  }
}

function shouldProbeVectorize(req: NextRequest): boolean {
  return hasHealthProbe(req, "vectorize")
}

function shouldProbeDurableObject(req: NextRequest): boolean {
  return hasHealthProbe(req, "durable-object", "durable_object")
}

function shouldProbeProviders(req: NextRequest): boolean {
  return hasHealthProbe(req, "providers", "provider")
}

async function checkDurableObject(probeLive: boolean): Promise<CheckResult> {
  const start = Date.now()
  try {
    const ns = getCloudflareAtomicCounterBinding()
    if (!ns) {
      return { status: "not_configured", latencyMs: Date.now() - start }
    }
    if (!probeLive) {
      return { status: "skipped", latencyMs: Date.now() - start }
    }
    const id = ns.idFromName("health-ping")
    const stub = ns.get(id)
    const res = await stub.fetch(
      new Request("https://fake-host/counter/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 1 }),
      })
    )
    // Accept any 2xx or 4xx — a response means the DO is alive
    if (res.status >= 200 && res.status < 500) {
      return { status: "ok", latencyMs: Date.now() - start }
    }
    return { status: "error", latencyMs: Date.now() - start }
  } catch {
    return { status: "error", latencyMs: Date.now() - start }
  }
}

function emptyProviderHealthStatus(): ProviderHealthStatus {
  return {
    vertex: {
      name: "vertex",
      healthy: false,
      lastCheckedAt: 0,
      latencyMs: 0,
      consecutiveFailures: 0,
      failureRate5m: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      lastFailureAt: 0,
      excludedUntil: 0,
    },
    openai: {
      name: "openai",
      healthy: false,
      lastCheckedAt: 0,
      latencyMs: 0,
      consecutiveFailures: 0,
      failureRate5m: 0,
      p50LatencyMs: 0,
      p95LatencyMs: 0,
      p99LatencyMs: 0,
      lastFailureAt: 0,
      excludedUntil: 0,
    },
  }
}

async function getProviderHealthStatus(
  probeLive: boolean,
  openAIConfigured: boolean,
): Promise<ProviderHealthStatus> {
  try {
    if (probeLive) {
      return await checkProviderHealth({ forceOpenAIProbe: openAIConfigured })
    }
    return getProviderHealthSnapshot()
  } catch {
    return emptyProviderHealthStatus()
  }
}

function mapProviderCheck(
  provider: ProviderHealthStatus["vertex"],
  options?: { configured?: boolean; probeLive?: boolean },
): CheckResult {
  if (options?.configured === false) {
    return { status: "not_configured", latencyMs: 0 }
  }

  if (!options?.probeLive && provider.lastCheckedAt === 0) {
    return { status: "skipped", latencyMs: provider.latencyMs }
  }

  return {
    status: provider.healthy ? "ok" : "degraded",
    latencyMs: provider.latencyMs,
  }
}

export async function GET(req: NextRequest) {
  // ── 1. Minimal public liveness signal ───────────────────────────────────────
  // No deep/probe flags → cheapest possible success. Safe to expose publicly —
  // reveals nothing about infrastructure topology.
  const isDeepRequested =
    req.nextUrl.searchParams.get("deep") === "true" ||
    req.nextUrl.searchParams.getAll("probe").length > 0

  if (!isDeepRequested) {
    return Response.json({ ok: true }, { status: 200 })
  }

  // ── 2. Authenticate deep probe caller ────────────────────────────────────────
  const caller = await resolveDeepHealthCaller(req)
  if (!caller.authorized) {
    log({ level: "warn", event: "health.deep.unauthorized", timestamp: Date.now() })
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  // ── 3. Rate-limit deep probes ────────────────────────────────────────────────
  const rateResult = await checkRateLimit(caller.rateLimitId, "free", "api")
  if (!rateResult.allowed) {
    log({
      level: "warn",
      event: "health.deep.rate_limited",
      metadata: { rateLimitId: caller.rateLimitId },
      timestamp: Date.now(),
    })
    return rateLimitExceededResponse(rateResult)
  }

  // ── 4. Run infrastructure probes ─────────────────────────────────────────────
  const start = Date.now()
  const probeVectorize = shouldProbeVectorize(req)
  const probeDurableObject = shouldProbeDurableObject(req)
  const probeProviders = shouldProbeProviders(req)
  const openAIConfigured = envExists("OPENAI_API_KEY")

  const [kvCheck, d1Check, vectorizeCheck, doCheck, providerHealth] = await Promise.all([
    checkKV(),
    checkD1(),
    checkVectorize(probeVectorize),
    checkDurableObject(probeDurableObject),
    getProviderHealthStatus(probeProviders, openAIConfigured),
  ])

  const checks: Record<string, CheckResult> = {
    kv: kvCheck,
    d1: d1Check,
    vectorize: vectorizeCheck,
    durable_object: doCheck,
    vertex: mapProviderCheck(providerHealth.vertex, { probeLive: probeProviders }),
    openai: mapProviderCheck(providerHealth.openai, {
      configured: openAIConfigured,
      probeLive: probeProviders,
    }),
  }

  const anyDegraded = Object.values(checks).some(
    (c) => c.status === "degraded" || c.status === "error"
  )

  const overallStatus = anyDegraded ? "degraded" : "healthy"

  return Response.json(
    {
      status: overallStatus,
      latencyMs: Date.now() - start,
      checks,
    },
    { status: anyDegraded ? 503 : 200 }
  )
}
