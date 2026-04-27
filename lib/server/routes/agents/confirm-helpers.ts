import { z } from "zod"
import type { AgentPlan } from "@/lib/ai/agents/planner"
import type { ToolContext } from "@/lib/ai/agents/tools/types"
import { verifyAndConsumeToken } from "@/lib/ai/agents/confirm"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { buildAgentToolContext } from "@/lib/server/routes/agents/execution-helpers"
import type { KVStore } from "@/types"

export const confirmSchema = z.object({
  confirmToken: z.string().min(1).max(200),
  approved: z.boolean(),
})

export type ConfirmRequestData = z.infer<typeof confirmSchema>

export type ParsedConfirmRequest =
  | { ok: true; data: ConfirmRequestData }
  | { ok: false; kind: "invalid_json" | "validation"; response: Response }

export interface PreparedConfirmedAgentExecution {
  plan: AgentPlan
  ctx: ToolContext
}

export type PreparedConfirmedAgentExecutionResult =
  | { ok: true; data: PreparedConfirmedAgentExecution }
  | { ok: false; kind: "invalid_token" | "cancelled"; response: Response }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function parseConfirmRequest(
  req: Pick<Request, "json">,
): Promise<ParsedConfirmRequest> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      kind: "invalid_json",
      response: jsonResponse({ error: "Invalid JSON" }, 400),
    }
  }

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      kind: "validation",
      response: jsonResponse({ error: "Validation error", details: parsed.error.flatten() }, 400),
    }
  }

  return { ok: true, data: parsed.data }
}

export async function prepareConfirmedAgentExecution(
  kv: KVStore,
  userId: string,
  confirmToken: string,
  approved: boolean,
  vectorizeEnv: VectorizeEnv | null,
): Promise<PreparedConfirmedAgentExecutionResult> {
  const plan = await verifyAndConsumeToken(kv, confirmToken, userId)
  if (!plan) {
    return {
      ok: false,
      kind: "invalid_token",
      response: jsonResponse({ error: "Invalid, expired, or already-used confirmation token" }, 400),
    }
  }

  if (!approved) {
    return {
      ok: false,
      kind: "cancelled",
      response: jsonResponse({ status: "cancelled" }),
    }
  }

  return {
    ok: true,
    data: {
      plan,
      ctx: buildAgentToolContext(userId, { kv, vectorizeEnv }),
    },
  }
}
