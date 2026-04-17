/**
 * POST /api/v1/agents/confirm
 *
 * Executes a confirmed agent plan via SSE stream.
 * Requires a valid confirmation token issued by /api/v1/agents/plan.
 *
 * SSE event types:
 *   { type: "step_start",  stepNumber, description }
 *   { type: "step_done",   stepNumber, summary, output }
 *   { type: "step_error",  stepNumber, error }
 *   { type: "complete",    summary, stepsCompleted }
 */

import { getRequestContext } from "@cloudflare/next-on-pages"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { verifyAndConsumeToken } from "@/lib/ai/agent-confirm"
import { executeAgentTool, type ToolContext } from "@/lib/ai/agent-tools"
import { saveAgentHistory } from "@/lib/ai/agent-history"
import { awardXP } from "@/lib/gamification/xp-engine"
import { nanoid } from "nanoid"
import { z } from "zod"
import type { KVStore } from "@/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"

export const runtime = "edge"

// ─── Hardcoded tool allowlist — never expandable at runtime ──────────────────
// Any tool name from Gemini/the plan that is NOT in this set is silently skipped.

const TOOL_ALLOWLIST = new Set([
  "searchMemory",
  "setReminder",
  "takeNote",
  "readCalendar",
  "createCalendarEvent",
  "createNote",
  "draftEmail",
  "searchWeb",
  "logExpense",
  "getWeekSummary",
  "updateGoalProgress",
])

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

// ─── Request schema ───────────────────────────────────────────────────────────

const confirmSchema = z.object({
  confirmToken: z.string().min(1).max(200),
  approved: z.boolean(),
})

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

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return jsonResponse({ error: "Validation error", details: parsed.error.flatten() }, 400)
  }

  const { confirmToken, approved } = parsed.data

  // Verify and consume the token — single use
  const plan = await verifyAndConsumeToken(kv, confirmToken, userId)
  if (!plan) {
    return jsonResponse({ error: "Invalid, expired, or already-used confirmation token" }, 400)
  }

  // User cancelled
  if (!approved) {
    return jsonResponse({ status: "cancelled" })
  }

  // Build execution context
  const appEnv = getEnv()
  const vectorizeEnv = getVectorizeEnv()
  const ctx: ToolContext = {
    kv,
    vectorizeEnv,
    userId,
    googleClientId: appEnv.GOOGLE_CLIENT_ID,
    googleClientSecret: appEnv.GOOGLE_CLIENT_SECRET,
  }

  // Stream SSE execution
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
      }

      let stepsCompleted = 0

      for (const step of plan.steps) {
        // Security: validate tool name against hardcoded allowlist
        if (!TOOL_ALLOWLIST.has(step.toolName)) {
          send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool not available" })
          continue
        }

        send({ type: "step_start", stepNumber: step.stepNumber, description: step.description })

        try {
          const result = await executeAgentTool(
            { name: step.toolName, args: step.args ?? {} },
            ctx,
          )

          send({
            type: "step_done",
            stepNumber: step.stepNumber,
            summary: result.summary,
            output: result.output,
            status: result.status,
          })

          if (result.status === "done") {
            stepsCompleted++
            // Fire-and-forget XP per completed step
            awardXP(kv, userId, "agent", 2).catch(() => {})
          }
        } catch {
          send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool execution failed" })
        }
      }

      // Determine final status
      const finalStatus =
        stepsCompleted === plan.steps.length
          ? "completed"
          : stepsCompleted > 0
            ? "partial"
            : "cancelled"

      // Save to history (fire-and-forget on error)
      saveAgentHistory(kv, userId, {
        id: nanoid(8),
        date: new Date().toISOString(),
        userMessage: plan.summary.slice(0, 100),
        planSummary: plan.summary,
        stepsCompleted,
        stepsTotal: plan.steps.length,
        status: finalStatus,
      }).catch(() => {})

      send({
        type: "complete",
        summary: stepsCompleted > 0
          ? `Done! Completed ${stepsCompleted} of ${plan.steps.length} steps.`
          : "No steps could be completed.",
        stepsCompleted,
        status: finalStatus,
      })

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  })
}
