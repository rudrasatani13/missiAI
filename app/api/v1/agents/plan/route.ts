import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { z } from "zod"
import { buildAgentPlan } from "@/lib/ai/agent-planner"
import { generateConfirmToken, storeConfirmToken } from "@/lib/ai/agent-confirm"
import { getEnv } from "@/lib/server/env"
import { getGoogleTokens } from "@/lib/plugins/data-fetcher"
import { searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import type { KVStore } from "@/types"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

const planSchema = z.object({
  message: z.string().min(1).max(500)
})

export async function POST(req: NextRequest) {
  try {
    const userId = await getVerifiedUserId()
    const kv = getKV()

    if (!kv) {
      return new Response(JSON.stringify({ error: "Service unavailable" }), { status: 500 })
    }

    const { env } = getRequestContext()
    const vectorizeEnv = (env as any).LIFE_GRAPH ? { LIFE_GRAPH: (env as any).LIFE_GRAPH } : null

    const body = await req.json()
    const parsed = planSchema.safeParse(body)
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400 })
    }

    const message = parsed.data.message

    // Agent specific rate limit logic
    const today = new Date().toISOString().split('T')[0]
    const rlKey = `ratelimit:agent-exec:${userId}:${today}`
    const rawLimit = await kv.get(rlKey)
    const execCount = parseInt(rawLimit || "0", 10)

    const userPlanRaw = await kv.get(`stripe:sub:${userId}`)
    const isPro = !!userPlanRaw
    const maxExecutions = isPro ? 50 : 10

    if (execCount >= maxExecutions) {
      return new Response(JSON.stringify({ error: "Daily agent limit reached" }), { status: 429 })
    }

    await kv.put(rlKey, (execCount + 1).toString(), { expirationTtl: 86400 })

    const appEnv = getEnv()
    const geminiApiKey = appEnv.GEMINI_API_KEY

    // Load memory context
    const memResults = await searchLifeGraph(kv, vectorizeEnv, userId, message, geminiApiKey, { topK: 3 })
    const memoryContext = formatLifeGraphForPrompt(memResults)

    // Build available tools
    const availableTools = [
      "searchMemory", "takeNote", "createNote", "searchWeb", "getWeekSummary", "logExpense", "updateGoalProgress", "draftEmail"
    ]

    const googleTokens = await getGoogleTokens(kv, userId)
    if (googleTokens) {
      availableTools.push("readCalendar", "createCalendarEvent")
    }

    // Call planner
    const plan = await buildAgentPlan(message, availableTools, memoryContext, geminiApiKey)

    if (plan.steps.length === 0 || !plan.requiresConfirmation) {
      return new Response(JSON.stringify({ plan, confirmToken: null, requiresConfirmation: plan.requiresConfirmation }), { status: 200 })
    }

    // Generate confirm token
    const tokenBasis = plan.planId
    const confirmToken = await generateConfirmToken(tokenBasis, userId, appEnv.MISSI_KV_ENCRYPTION_SECRET || "default_secret")

    await storeConfirmToken(kv, confirmToken, plan, userId)

    return new Response(JSON.stringify({ plan, confirmToken, requiresConfirmation: true }), { status: 200 })
  } catch (err) {
    if (err instanceof AuthenticationError) return unauthorizedResponse()
    return new Response(JSON.stringify({ error: "Internal error" }), { status: 500 })
  }
}
