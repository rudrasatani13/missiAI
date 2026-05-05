// ─── Agents — Consolidated Catch-All Route ────────────────────────────────────
//
// Handles: confirm, expenses, history, plan
// Consolidation reduces 4 separate edge function bundles into 1.

import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from "@/lib/server/platform/bindings"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/security/auth"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { getLifeGraphReadSnapshot } from "@/lib/memory/life-graph"
import { getAgentHistory } from "@/lib/ai/agents/history"
import { buildMonthlyTotals } from "@/lib/budget/budget-store"
import { getTodayDate } from "@/lib/billing/usage-tracker"
import { checkAndIncrementAtomicCounter } from "@/lib/server/platform/atomic-quota"
import { parseConfirmRequest, prepareConfirmedAgentExecution } from "@/lib/server/routes/agents/confirm-helpers"
import { runConfirmedAgentExecution } from "@/lib/server/routes/agents/confirm-runner"
import { parsePlanRequest, prepareAgentPlan } from "@/lib/server/routes/agents/plan-helpers"
import { logRequest, logError } from "@/lib/server/observability/logger"
import type { KVStore } from "@/types"
import type { LifeNode } from "@/types/memory"

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

type AuthenticatedAgentUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

async function getAuthenticatedAgentUserId(): Promise<AuthenticatedAgentUserResult> {
  try {
    return { ok: true, userId: await getVerifiedUserId() }
  } catch (e) {
    if (e instanceof AuthenticationError) return { ok: false, response: jsonResponse({ error: "Unauthorized" }, 401) }
    return { ok: false, response: jsonResponse({ error: "Auth error" }, 500) }
  }
}

// ─── Confirm Handler (POST /confirm) ──────────────────────────────────────────

async function handleConfirm(req: Request): Promise<Response> {
  const startTime = Date.now()
  const auth = await getAuthenticatedAgentUserId()
  if (!auth.ok) return auth.response
  const { userId } = auth

  const kv = getCloudflareKVBinding()
  if (!kv) return jsonResponse({ error: "Storage unavailable" }, 503)

  const parsed = await parseConfirmRequest(req)
  if (!parsed.ok) return parsed.response

  const prepared = await prepareConfirmedAgentExecution(
    kv,
    userId,
    parsed.data.confirmToken,
    parsed.data.approved,
    getCloudflareVectorizeEnv(),
  )
  if (!prepared.ok) {
    logRequest(
      prepared.kind === "cancelled" ? "agents.confirm.cancelled" : "agents.confirm.invalid_token",
      userId,
      startTime,
      { approved: parsed.data.approved },
    )
    return prepared.response
  }

  const { plan, ctx } = prepared.data
  logRequest("agents.confirm.accepted", userId, startTime, {
    approved: parsed.data.approved,
    steps: plan.steps.length,
    requiresConfirmation: plan.requiresConfirmation,
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      await runConfirmedAgentExecution({ kv, userId, plan, ctx, send })
      controller.close()
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  })
}

// ─── Expenses Handler (GET /expenses) ─────────────────────────────────────────

interface ExpenseTotal { total: number; byCategory: Record<string, number> }

async function handleExpenses(): Promise<Response> {
  const auth = await getAuthenticatedAgentUserId()
  if (!auth.ok) return auth.response
  const { userId } = auth

  const kv = getCloudflareKVBinding()
  if (!kv) return jsonResponse({ monthlyTotal: 0, currency: "INR", byCategory: {}, recentEntries: [] })

  const yearMonth = new Date().toISOString().slice(0, 7)
  const [totals, graph] = await Promise.all([
    buildMonthlyTotals(kv, userId, yearMonth).then<ExpenseTotal>((report) => ({
      total: report.total,
      byCategory: report.byCategory,
    })).catch(() => ({ total: 0, byCategory: {} })),
    getLifeGraphReadSnapshot(kv, userId),
  ])

  const recentEntries: LifeNode[] = graph.nodes
    .filter(n => Array.isArray(n.tags) && n.tags.includes("expense"))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 30)

  return jsonResponse({ monthlyTotal: totals.total, currency: "INR", byCategory: totals.byCategory, recentEntries })
}

// ─── History Handler (GET /history) ───────────────────────────────────────────

async function handleHistory(): Promise<Response> {
  const auth = await getAuthenticatedAgentUserId()
  if (!auth.ok) return auth.response
  const { userId } = auth

  const kv = getCloudflareKVBinding()
  if (!kv) return jsonResponse({ entries: [] })

  const entries = await getAgentHistory(kv, userId)
  return jsonResponse({ entries })
}

// ─── Plan Handler (POST /plan) ────────────────────────────────────────────────

const AGENT_PLAN_MAX_BODY_BYTES = 65_536 // 64 KB — message is max 500 chars; no large payloads expected

const FREE_DAILY_LIMIT = 100
const PAID_DAILY_LIMIT = 500

async function checkAgentRateLimit(kv: KVStore, userId: string, plan: string) {
  const today = getTodayDate()
  const limit = plan === "free" ? FREE_DAILY_LIMIT : PAID_DAILY_LIMIT
  const atomicResult = await checkAndIncrementAtomicCounter(`agent:${userId}:${today}`, limit, 86_400)
  if (atomicResult) {
    return { allowed: atomicResult.allowed, remaining: atomicResult.remaining }
  }
  void kv
  return { allowed: false, remaining: 0, unavailable: true }
}

async function handlePlan(req: Request): Promise<Response> {
  const startTime = Date.now()

  const contentLength = req.headers.get("content-length")
  if (contentLength && parseInt(contentLength, 10) > AGENT_PLAN_MAX_BODY_BYTES) {
    return jsonResponse({ error: "Payload too large" }, 413)
  }

  const auth = await getAuthenticatedAgentUserId()
  if (!auth.ok) return auth.response
  const { userId } = auth

  const kv = getCloudflareKVBinding()
  if (!kv) return jsonResponse({ error: "Storage unavailable" }, 503)

  const parsed = await parsePlanRequest(req)
  if (!parsed.ok) {
    if (parsed.kind === "invalid_json") return jsonResponse({ error: "Invalid JSON" }, 400)
    return jsonResponse({ error: "Validation error", details: parsed.error.flatten() }, 400)
  }

  const { message } = parsed.data

  let userPlan: string
  try { userPlan = await getUserPlan(userId) } catch { userPlan = "free" }

  const rateResult = await checkAgentRateLimit(kv, userId, userPlan)
  if (!rateResult.allowed) {
    if (rateResult.unavailable) {
      logError("agents.plan.rate_limit_unavailable", "Rate limit service unavailable", userId)
      return jsonResponse({ error: "Rate limit service unavailable" }, 503)
    }
    const limit = userPlan === "free" ? FREE_DAILY_LIMIT : PAID_DAILY_LIMIT
    logRequest("agents.plan.rate_limited", userId, startTime, { limit, plan: userPlan })
    return jsonResponse({ error: `Daily agent limit reached (${limit}/day). Upgrade for more.` }, 429)
  }

  const prepared = await prepareAgentPlan(kv, userId, message, getCloudflareVectorizeEnv())
  if (!prepared.ok) {
    logError("agents.plan.confirmation_unavailable", "Confirmation unavailable", userId)
    return jsonResponse({ error: "Confirmation unavailable" }, 503)
  }

  const { plan, confirmToken } = prepared.data
  logRequest("agents.plan.created", userId, startTime, {
    steps: plan.steps.length,
    requiresConfirmation: plan.requiresConfirmation,
    confirmTokenIssued: confirmToken !== null,
    remaining: rateResult.remaining,
  })

  return jsonResponse({
    plan, confirmToken,
    requiresConfirmation: plan.requiresConfirmation,
    remaining: rateResult.remaining,
  })
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const segment = path[0]

  switch (segment) {
    case 'expenses': return handleExpenses()
    case 'history': return handleHistory()
    default: return jsonResponse({ error: 'Not found' }, 404)
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const segment = path[0]

  switch (segment) {
    case 'confirm': return handleConfirm(req)
    case 'plan': return handlePlan(req)
    default: return jsonResponse({ error: 'Not found' }, 404)
  }
}
