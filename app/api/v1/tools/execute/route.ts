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
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { executeAgentTool, type AgentToolCall, type ToolContext } from "@/lib/ai/agent-tools"
import { AGENT_SAFE_TOOL_NAMES, AGENT_DESTRUCTIVE_TOOL_NAMES } from "@/lib/ai/agent-tool-policy"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/rateLimiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { logRequest, logError } from "@/lib/server/logger"
import { getEnv } from "@/lib/server/env"
import { z } from "zod"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { KVStore } from "@/types"
import { API_ERROR_CODES, errorResponse } from "@/types/api"


// ── Safe-tool allowlist for the Live WebSocket path ───────────────────────────
//
// This endpoint is called by the Gemini Live client and must NOT allow tools
// that send outbound messages or destructively mutate external services without
// a server-issued confirmation token (the agent-confirm flow).
//
// Threat: any authenticated user (or prompt-injection in a Live session) could
// call POST /api/v1/tools/execute with name="confirmSendEmail" and arbitrary
// recipient/body to send real email via Resend, or calendar write tools to
// mutate the user's calendar, without any server-side step-up.
//
// C2 fix: the allowlist is now shared from `@/lib/ai/agent-tool-policy` so the
// chat-stream agent loop enforces the exact same policy. Do NOT inline a
// divergent list here.
const LIVE_SAFE_TOOL_NAMES = AGENT_SAFE_TOOL_NAMES
const BLOCKED_FROM_LIVE = AGENT_DESTRUCTIVE_TOOL_NAMES

// ── Zod schema for request body (BUG-003 fix) ────────────────────────────────
const toolExecuteSchema = z.object({
  name: z.string().min(1, "Tool name required").max(50, "Tool name too long"),
  args: z.record(z.unknown()).optional().default({}),
})

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getCloudflareContext()
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
    throw e
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
    return errorResponse("Invalid JSON", API_ERROR_CODES.VALIDATION_ERROR, 400)
  }

  const parsed = toolExecuteSchema.safeParse(rawBody)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    return errorResponse(
      `Validation error: ${firstIssue?.path.join(".")} — ${firstIssue?.message}`,
      API_ERROR_CODES.VALIDATION_ERROR,
      400,
    )
  }

  const { name, args } = parsed.data

  // ── 4. Validate tool name against safe-tool allowlist ────────────────────
  if (BLOCKED_FROM_LIVE.has(name)) {
    logRequest("tools-execute.blocked_tool", userId, startTime, { toolName: name })
    return errorResponse(
      `Tool "${name}" requires agent confirmation and cannot be called from this endpoint.`,
      API_ERROR_CODES.VALIDATION_ERROR,
      400,
    )
  }
  if (!LIVE_SAFE_TOOL_NAMES.has(name)) {
    logRequest("tools-execute.unknown_tool", userId, startTime, { toolName: name })
    return errorResponse(
      `Unknown tool: "${name}". Available tools: ${[...LIVE_SAFE_TOOL_NAMES].join(", ")}`,
      API_ERROR_CODES.VALIDATION_ERROR,
      400,
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
    return errorResponse(
      "Internal error executing tool.",
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
    )
  }
}
