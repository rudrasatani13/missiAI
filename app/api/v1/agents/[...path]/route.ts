// ─── Agents — Consolidated Catch-All Route ────────────────────────────────────
//
// Handles: confirm, expenses, history, plan
// Consolidation reduces 4 separate edge function bundles into 1.

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { searchLifeGraph, formatLifeGraphForPrompt, getLifeGraph, MEMORY_TIMEOUT_MS } from "@/lib/memory/life-graph"
import { getGoogleTokens } from "@/lib/plugins/data-fetcher"
import { buildAgentPlan } from "@/lib/ai/agent-planner"
import { verifyAndConsumeToken, generateConfirmToken, storeConfirmToken } from "@/lib/ai/agent-confirm"
import { executeAgentTool, AGENT_FUNCTION_DECLARATIONS, type ToolContext } from "@/lib/ai/agent-tools"
import { getAgentHistory, saveAgentHistory } from "@/lib/ai/agent-history"
import { awardXP } from "@/lib/gamification/xp-engine"
import { getTodayDate } from "@/lib/billing/usage-tracker"
import { checkAndIncrementAtomicCounter } from "@/lib/server/atomic-quota"
import { nanoid } from "nanoid"
import { z } from "zod"
import type { KVStore } from "@/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { LifeNode } from "@/types/memory"


// ─── Shared Helpers ───────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getCloudflareContext()
    const lifeGraph = (env as Record<string, unknown>).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph as VectorizeEnv["LIFE_GRAPH"] }
  } catch {
    return null
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

// ─── Confirm Handler (POST /confirm) ──────────────────────────────────────────

const TOOL_ALLOWLIST = new Set([
  "searchMemory", "setReminder", "takeNote", "readCalendar",
  "createCalendarEvent", "createNote", "draftEmail", "searchWeb",
  "logExpense", "getWeekSummary", "updateGoalProgress",
])

const confirmSchema = z.object({
  confirmToken: z.string().min(1).max(200),
  approved: z.boolean(),
})

async function handleConfirm(req: Request): Promise<Response> {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return jsonResponse({ error: "Unauthorized" }, 401)
    return jsonResponse({ error: "Auth error" }, 500)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ error: "Storage unavailable" }, 503)

  let body: unknown
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: "Validation error", details: parsed.error.flatten() }, 400)
  }

  const { confirmToken, approved } = parsed.data
  const plan = await verifyAndConsumeToken(kv, confirmToken, userId)
  if (!plan) return jsonResponse({ error: "Invalid, expired, or already-used confirmation token" }, 400)
  if (!approved) return jsonResponse({ status: "cancelled" })

  const appEnv = getEnv()
  const vectorizeEnv = getVectorizeEnv()
  const ctx: ToolContext = {
    kv, vectorizeEnv, userId,
    googleClientId: appEnv.GOOGLE_CLIENT_ID,
    googleClientSecret: appEnv.GOOGLE_CLIENT_SECRET,
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let stepsCompleted = 0

      const DESTRUCTIVE_TOOLS_LOCAL = new Set([
        "createCalendarEvent",
        "createNote",
        "draftEmail",
        "sendEmail",
        "logExpense",
        "updateGoalProgress",
        "takeNote",
        "setReminder",
        "saveContact",
        "updateCalendarEvent",
        "deleteCalendarEvent",
      ])
      // Brief check on step dependencies to avoid race conditions.
      // If any step modifies state, we fall back to sequential execution.
      const hasDependencies = plan.steps.some(s => DESTRUCTIVE_TOOLS_LOCAL.has(s.toolName) || s.isDestructive)

      if (hasDependencies) {
        for (const step of plan.steps) {
          if (!TOOL_ALLOWLIST.has(step.toolName)) {
            send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool not available" })
            continue
          }
          send({ type: "step_start", stepNumber: step.stepNumber, description: step.description })
          try {
            const result = await executeAgentTool({ name: step.toolName, args: step.args ?? {} }, ctx)
            send({ type: "step_done", stepNumber: step.stepNumber, summary: result.summary, output: result.output, status: result.status })
            if (result.status === "done") {
              stepsCompleted++
              awardXP(kv, userId, "agent", 2).catch(() => {})
            }
          } catch {
            send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool execution failed" })
          }
        }
      } else {
        await Promise.all(
          plan.steps.map(async (step) => {
            if (!TOOL_ALLOWLIST.has(step.toolName)) {
              send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool not available" })
              return
            }
            send({ type: "step_start", stepNumber: step.stepNumber, description: step.description })
            try {
              const result = await executeAgentTool({ name: step.toolName, args: step.args ?? {} }, ctx)
              send({ type: "step_done", stepNumber: step.stepNumber, summary: result.summary, output: result.output, status: result.status })
              if (result.status === "done") {
                stepsCompleted++
                awardXP(kv, userId, "agent", 2).catch(() => {})
              }
            } catch {
              send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool execution failed" })
            }
          })
        )
      }

      const finalStatus = stepsCompleted === plan.steps.length ? "completed" : stepsCompleted > 0 ? "partial" : "cancelled"
      saveAgentHistory(kv, userId, {
        id: nanoid(8), date: new Date().toISOString(),
        userMessage: plan.summary.slice(0, 100), planSummary: plan.summary,
        stepsCompleted, stepsTotal: plan.steps.length, status: finalStatus,
      }).catch(() => {})

      send({
        type: "complete",
        summary: stepsCompleted > 0 ? `Done! Completed ${stepsCompleted} of ${plan.steps.length} steps.` : "No steps could be completed.",
        stepsCompleted, status: finalStatus,
      })
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
  let userId: string
  try { userId = await getVerifiedUserId() }
  catch (e) {
    if (e instanceof AuthenticationError) return jsonResponse({ error: "Unauthorized" }, 401)
    return jsonResponse({ error: "Auth error" }, 500)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ monthlyTotal: 0, currency: "INR", byCategory: {}, recentEntries: [] })

  const yearMonth = new Date().toISOString().slice(0, 7)
  const [totalsRaw, graph] = await Promise.all([
    kv.get(`expense:total:${userId}:${yearMonth}`),
    getLifeGraph(kv, userId),
  ])

  let totals: ExpenseTotal = { total: 0, byCategory: {} }
  try { if (totalsRaw) totals = JSON.parse(totalsRaw) as ExpenseTotal } catch {}

  const recentEntries: LifeNode[] = graph.nodes
    .filter(n => Array.isArray(n.tags) && n.tags.includes("expense"))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 30)

  return jsonResponse({ monthlyTotal: totals.total, currency: "INR", byCategory: totals.byCategory, recentEntries })
}

// ─── History Handler (GET /history) ───────────────────────────────────────────

async function handleHistory(): Promise<Response> {
  let userId: string
  try { userId = await getVerifiedUserId() }
  catch (e) {
    if (e instanceof AuthenticationError) return jsonResponse({ error: "Unauthorized" }, 401)
    return jsonResponse({ error: "Auth error" }, 500)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ entries: [] })

  const entries = await getAgentHistory(kv, userId)
  return jsonResponse({ entries })
}

// ─── Plan Handler (POST /plan) ────────────────────────────────────────────────

const FREE_DAILY_LIMIT = 100
const PAID_DAILY_LIMIT = 500

async function checkAgentRateLimit(kv: KVStore, userId: string, plan: string) {
  const today = getTodayDate()
  const key = `ratelimit:agent-exec:${userId}:${today}`
  const limit = plan === "free" ? FREE_DAILY_LIMIT : PAID_DAILY_LIMIT
  const atomicResult = await checkAndIncrementAtomicCounter(`agent:${userId}:${today}`, limit, 86_400)
  if (atomicResult) {
    return { allowed: atomicResult.allowed, remaining: atomicResult.remaining }
  }
  const raw = await kv.get(key)
  const count = raw ? parseInt(raw, 10) : 0
  if (count >= limit) return { allowed: false, remaining: 0 }
  await kv.put(key, String(count + 1), { expirationTtl: 86_400 })
  return { allowed: true, remaining: limit - count - 1 }
}

const planSchema = z.object({ message: z.string().min(1).max(500) })

const BASE_TOOLS = [
  "searchMemory", "takeNote", "createNote", "searchWeb",
  "getWeekSummary", "logExpense", "updateGoalProgress", "draftEmail", "setReminder",
]
const CALENDAR_TOOLS = ["readCalendar", "createCalendarEvent"]

async function handlePlan(req: Request): Promise<Response> {
  let userId: string
  try { userId = await getVerifiedUserId() }
  catch (e) {
    if (e instanceof AuthenticationError) return jsonResponse({ error: "Unauthorized" }, 401)
    return jsonResponse({ error: "Auth error" }, 500)
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ error: "Storage unavailable" }, 503)

  let body: unknown
  try { body = await req.json() } catch { return jsonResponse({ error: "Invalid JSON" }, 400) }

  const parsed = planSchema.safeParse(body)
  if (!parsed.success) return jsonResponse({ error: "Validation error", details: parsed.error.flatten() }, 400)

  const { message } = parsed.data

  let userPlan: string
  try { userPlan = await getUserPlan(userId) } catch { userPlan = "free" }

  const rateResult = await checkAgentRateLimit(kv, userId, userPlan)
  if (!rateResult.allowed) {
    const limit = userPlan === "free" ? FREE_DAILY_LIMIT : PAID_DAILY_LIMIT
    return jsonResponse({ error: `Daily agent limit reached (${limit}/day). Upgrade for more.` }, 429)
  }

  const appEnv = getEnv()
  const vectorizeEnv = getVectorizeEnv()
  let memoryContext = ""
  try {
    const results = await Promise.race([
      searchLifeGraph(kv, vectorizeEnv, userId, message, { topK: 3 }),
      new Promise<[]>((res) => setTimeout(() => res([]), MEMORY_TIMEOUT_MS)),
    ])
    if (results.length > 0) memoryContext = formatLifeGraphForPrompt(results).slice(0, 500)
  } catch {}

  let availableTools = [...BASE_TOOLS]
  try {
    const googleTokens = await getGoogleTokens(kv, userId)
    if (googleTokens) availableTools = [...availableTools, ...CALENDAR_TOOLS]
  } catch {}

  const declaredNames = new Set(AGENT_FUNCTION_DECLARATIONS.map(d => d.name))
  availableTools = availableTools.filter(t => declaredNames.has(t))

  const agentPlan = await buildAgentPlan(message, availableTools, memoryContext)

  let confirmToken: string | null = null
  if (agentPlan.steps.length > 0) {
    const planHash = nanoid(12)
    const secret = appEnv.MISSI_KV_ENCRYPTION_SECRET
    if (!secret) {
      return jsonResponse({ error: 'Confirmation unavailable' }, 503)
    }
    try {
      confirmToken = await generateConfirmToken(planHash, userId, secret)
      await storeConfirmToken(kv, confirmToken, agentPlan, userId)
    } catch (err) {
      console.error("[agent-plan] Failed to generate/store confirm token:", err)
      return jsonResponse({ error: 'Confirmation unavailable' }, 503)
    }
  }

  return jsonResponse({
    plan: agentPlan, confirmToken,
    requiresConfirmation: agentPlan.requiresConfirmation,
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
