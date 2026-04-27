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
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"
import { executeToolGuarded } from "@/lib/ai/agents/tools/execution"
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/server/security/rate-limiter"
import { getUserPlan } from "@/lib/billing/tier-checker"
import { logRequest } from "@/lib/server/observability/logger"
import { prepareLiveToolExecutionRequest } from "@/lib/server/routes/tools/execute-helpers"
import { API_ERROR_CODES, errorResponse } from "@/types/api"

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

  // ── 3. Parse / Validate / Build execution context ────────────────────────
  const prepared = await prepareLiveToolExecutionRequest(req, userId)
  if (!prepared.ok && prepared.kind === "blocked") {
    logRequest("tools-execute.blocked_tool", userId, startTime, { toolName: prepared.toolName })
    return prepared.response
  }
  if (!prepared.ok && prepared.kind === "unknown") {
    logRequest("tools-execute.unknown_tool", userId, startTime, { toolName: prepared.toolName })
    return prepared.response
  }
  if (!prepared.ok) {
    return prepared.response
  }

  // ── 4. Execute ───────────────────────────────────────────────────────────
  const { toolCall, ctx } = prepared.data

  const guardedResult = await executeToolGuarded(toolCall, ctx, {
    userId,
    logPrefix: "tools-execute",
    executionSurface: "live_execute",
  })

  if (guardedResult.metadata.threw) {
    return errorResponse(
      "Internal error executing tool.",
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
    )
  }

  logRequest("tools-execute.completed", userId, startTime, {
    toolName: toolCall.name,
    status: guardedResult.result.status,
    outcome: guardedResult.outcome,
  })

  return Response.json(guardedResult.result)
}
