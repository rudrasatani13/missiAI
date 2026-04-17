/**
 * POST /api/v1/agents/plan
 *
 * Generates a step-by-step agent plan for a user's request.
 * Does NOT execute any tools — planning only.
 *
 * Rate limits: free=10/day, plus/pro=50/day (shared with execution).
 * Plan generation counts against the limit to prevent spam.
 */

import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import { getGoogleTokens } from "@/lib/plugins/data-fetcher"
import { buildAgentPlan } from "@/lib/ai/agent-planner"
import { generateConfirmToken, storeConfirmToken } from "@/lib/ai/agent-confirm"
import { AGENT_FUNCTION_DECLARATIONS } from "@/lib/ai/agent-tools"
import { getTodayDate } from "@/lib/billing/usage-tracker"
import { nanoid } from "nanoid"
import { z } from "zod"
import type { KVStore } from "@/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"

export const runtime = "edge"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getRequestContext()
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

// ─── Rate limit helpers ───────────────────────────────────────────────────────

const FREE_DAILY_LIMIT = 100
const PAID_DAILY_LIMIT = 500

async function checkAgentRateLimit(
  kv: KVStore,
  userId: string,
  plan: string,
): Promise<{ allowed: boolean; remaining: number }> {
  const today = getTodayDate()
  const key = `ratelimit:agent-exec:${userId}:${today}`
  const limit = plan === "free" ? FREE_DAILY_LIMIT : PAID_DAILY_LIMIT

  const raw = await kv.get(key)
  const count = raw ? parseInt(raw, 10) : 0

  if (count >= limit) return { allowed: false, remaining: 0 }

  // Increment counter
  await kv.put(key, String(count + 1), { expirationTtl: 86_400 })
  return { allowed: true, remaining: limit - count - 1 }
}

// ─── Request schema ───────────────────────────────────────────────────────────

const planSchema = z.object({
  message: z.string().min(1).max(500),
})

// ─── Always-available tools ───────────────────────────────────────────────────

const BASE_TOOLS = [
  "searchMemory",
  "takeNote",
  "createNote",
  "searchWeb",
  "getWeekSummary",
  "logExpense",
  "updateGoalProgress",
  "draftEmail",
  "setReminder",
]

const CALENDAR_TOOLS = ["readCalendar", "createCalendarEvent"]

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  // Auth
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return jsonResponse({ error: "Unauthorized" }, 401)
    return jsonResponse({ error: "Auth error" }, 500)
  }

  // KV
  const kv = getKV()
  if (!kv) return jsonResponse({ error: "Storage unavailable" }, 503)

  // Validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400)
  }

  const parsed = planSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: "Validation error", details: parsed.error.flatten() }, 400)
  }

  const { message } = parsed.data

  // Rate limit check (plan generation counts toward limit)
  let userPlan: string
  try {
    userPlan = await getUserPlan(userId)
  } catch {
    userPlan = "free"
  }

  const rateResult = await checkAgentRateLimit(kv, userId, userPlan)
  if (!rateResult.allowed) {
    const limit = userPlan === "free" ? FREE_DAILY_LIMIT : PAID_DAILY_LIMIT
    return jsonResponse(
      { error: `Daily agent limit reached (${limit}/day). Upgrade for more.` },
      429,
    )
  }

  // Build memory context
  const appEnv = getEnv()
  const vectorizeEnv = getVectorizeEnv()
  let memoryContext = ""
  try {
    const results = await Promise.race([
      searchLifeGraph(kv, vectorizeEnv, userId, message, { topK: 3 }),
      new Promise<[]>(res => setTimeout(() => res([]), 3_000)),
    ])
    if (results.length > 0) {
      memoryContext = formatLifeGraphForPrompt(results).slice(0, 500)
    }
  } catch { /* non-critical */ }

  // Determine available tools based on connected services
  let availableTools = [...BASE_TOOLS]
  try {
    const googleTokens = await getGoogleTokens(kv, userId)
    if (googleTokens) {
      availableTools = [...availableTools, ...CALENDAR_TOOLS]
    }
  } catch { /* non-critical */ }

  // Only surface tools that have declarations (keep in sync with AGENT_FUNCTION_DECLARATIONS)
  const declaredNames = new Set(AGENT_FUNCTION_DECLARATIONS.map(d => d.name))
  availableTools = availableTools.filter(t => declaredNames.has(t))

  // Build plan
  const agentPlan = await buildAgentPlan(message, availableTools, memoryContext)

  // Issue confirmation token for ALL plans with steps (not just destructive ones)
  // This ensures the confirm route always receives a valid token string,
  // regardless of whether the plan requires user confirmation.
  let confirmToken: string | null = null
  if (agentPlan.steps.length > 0) {
    const planHash = nanoid(12)
    const secret = process.env.MISSI_KV_ENCRYPTION_SECRET || "missi-agent-confirm-fallback-secret-v1"
    try {
      confirmToken = await generateConfirmToken(planHash, userId, secret)
    } catch (err) {
      // crypto.subtle may not be available in all dev runtimes — use nanoid fallback
      console.error("[agent-plan] HMAC token generation failed, using nanoid fallback:", err)
      confirmToken = `fallback-${nanoid(32)}`
    }
    try {
      await storeConfirmToken(kv, confirmToken, agentPlan, userId)
    } catch (err) {
      console.error("[agent-plan] Failed to store confirm token in KV:", err)
      confirmToken = null // can't proceed without KV storage
    }
  }

  return jsonResponse({
    plan: agentPlan,
    confirmToken,
    requiresConfirmation: agentPlan.requiresConfirmation,
    remaining: rateResult.remaining,
  })
}
