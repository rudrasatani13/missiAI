/**
 * POST /api/v1/tools/execute — Execute a single agent tool
 *
 * Used by Gemini Live WebSocket to execute tools server-side.
 * The client sends the tool name and args, we execute it and return the result.
 *
 * BUG-002 fix: Added per-user rate limiting and plan-based gating.
 * BUG-003 fix: Added Zod schema validation and tool name allowlist.
 */

import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { executeAgentTool, AGENT_FUNCTION_DECLARATIONS, type AgentToolCall, type ToolContext } from "@/lib/ai/agent-tools"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { z } from "zod"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { KVStore } from "@/types"

export const runtime = "edge"

// ── Known tool names allowlist (BUG-003 fix) ───────────────────────────────────
const KNOWN_TOOL_NAMES = new Set(AGENT_FUNCTION_DECLARATIONS.map(d => d.name))
// Also allow confirmSendEmail which is an internal confirmation tool
KNOWN_TOOL_NAMES.add("confirmSendEmail")

// ── Zod schema for request body (BUG-003 fix) ────────────────────────────────
const toolExecuteSchema = z.object({
  name: z.string().min(1, "Tool name required").max(50, "Tool name too long"),
  args: z.record(z.unknown()).optional().default({}),
})

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getRequestContext()
    const lifeGraph = (env as any).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph }
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  // ── 1. Auth ──────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response("Unauthorized", { status: 401 })
  }

  // ── 2. Rate limit (BUG-002 fix) ──────────────────────────────────────────
  const planId = await getUserPlan(userId)
  const rlTier = planId === "free" ? "free" : "paid"
  const rateResult = await checkRateLimit(userId, rlTier, "ai")
  if (!rateResult.allowed) {
    logRequest("tools-execute.rate_limited", userId, startTime)
    return rateLimitExceededResponse(rateResult)
  }

  // ── 3. Parse & Validate body (BUG-003 fix) ───────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = toolExecuteSchema.safeParse(rawBody)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return Response.json(
      { error: `Validation error: ${firstIssue?.path.join(".")} — ${firstIssue?.message}` },
      { status: 400 },
    )
  }

  const { name, args } = parsed.data

  // ── 4. Validate tool name against allowlist (BUG-003 fix) ────────────────
  if (!KNOWN_TOOL_NAMES.has(name)) {
    logRequest("tools-execute.unknown_tool", userId, startTime, { toolName: name })
    return Response.json(
      { error: `Unknown tool: "${name}". Available tools: ${[...KNOWN_TOOL_NAMES].join(", ")}` },
      { status: 400 },
    )
  }

  // ── 5. Execute ───────────────────────────────────────────────────────────
  const appEnv = getEnv()
  const kv = getKV()
  const vectorizeEnv = getVectorizeEnv()

  const toolCall: AgentToolCall = { name, args }

  const ctx: ToolContext = {
    kv,
    vectorizeEnv,
    userId,
    apiKey: appEnv.GEMINI_API_KEY,
    googleClientId: appEnv.GOOGLE_CLIENT_ID,
    googleClientSecret: appEnv.GOOGLE_CLIENT_SECRET,
    resendApiKey: appEnv.RESEND_API_KEY,
  }

  try {
    const result = await executeAgentTool(toolCall, ctx)
    logRequest("tools-execute.completed", userId, startTime, { toolName: name, status: result.status })
    return Response.json(result)
  } catch (err) {
    logError("tools-execute.error", err instanceof Error ? err : new Error(String(err)), userId)
    return Response.json(
      { toolName: name, status: "error", summary: "Execution failed", output: "Internal error executing tool." },
      { status: 500 },
    )
  }
}
