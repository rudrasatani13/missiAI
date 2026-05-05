import { nanoid } from "nanoid"
import { z } from "zod"
import type { AgentPlan } from "@/lib/ai/agents/planner"
import { buildAgentPlan, DESTRUCTIVE_TOOLS } from "@/lib/ai/agents/planner"
import { generateConfirmToken, storeConfirmToken } from "@/lib/ai/agents/confirm"
import { AGENT_FUNCTION_DECLARATIONS } from "@/lib/ai/agents/tools/dispatcher"
import { formatLifeGraphForPrompt, MEMORY_TIMEOUT_MS, searchLifeGraph } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { getGoogleTokens } from "@/lib/plugins/data-fetcher"
import { getEnv } from "@/lib/server/platform/env"
import type { KVStore } from "@/types"

const BASE_TOOLS = [
  "searchMemory", "takeNote", "createNote", "searchWeb",
  "getWeekSummary", "updateGoalProgress", "draftEmail", "setReminder",
]
const CALENDAR_TOOLS = ["readCalendar", "createCalendarEvent"]
const PLAN_MEMORY_TOP_K = 3
const MAX_PLAN_MEMORY_CONTEXT_CHARS = 500

export const planSchema = z.object({ message: z.string().min(1).max(500) })

export type PlanRequestData = z.infer<typeof planSchema>

export type ParsedPlanRequest =
  | { ok: true; data: PlanRequestData }
  | { ok: false; kind: "invalid_json" }
  | { ok: false; kind: "validation"; error: z.ZodError<PlanRequestData> }

export interface PreparedAgentPlanData {
  plan: AgentPlan
  confirmToken: string | null
}

export type PreparedAgentPlanResult =
  | { ok: true; data: PreparedAgentPlanData }
  | { ok: false; kind: "confirmation_unavailable" }

export async function parsePlanRequest(
  req: Pick<Request, "json">,
): Promise<ParsedPlanRequest> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return { ok: false, kind: "invalid_json" }
  }

  const parsed = planSchema.safeParse(body)
  if (!parsed.success) {
    return { ok: false, kind: "validation", error: parsed.error }
  }

  return { ok: true, data: parsed.data }
}

async function loadAgentPlanMemoryContext(
  kv: KVStore,
  vectorizeEnv: VectorizeEnv | null,
  userId: string,
  message: string,
): Promise<string> {
  try {
    const emptyResults = [] as Awaited<ReturnType<typeof searchLifeGraph>>
    const results = await Promise.race([
      searchLifeGraph(kv, vectorizeEnv, userId, message, { topK: PLAN_MEMORY_TOP_K }),
      new Promise<Awaited<ReturnType<typeof searchLifeGraph>>>((resolve) => {
        setTimeout(() => resolve(emptyResults), MEMORY_TIMEOUT_MS)
      }),
    ])

    if (results.length > 0) {
      return formatLifeGraphForPrompt(results).slice(0, MAX_PLAN_MEMORY_CONTEXT_CHARS)
    }
  } catch {}

  return ""
}

async function resolveAgentPlanToolNames(
  kv: KVStore,
  userId: string,
): Promise<string[]> {
  let availableTools = [...BASE_TOOLS]

  try {
    const googleTokens = await getGoogleTokens(kv, userId)
    if (googleTokens) {
      availableTools = [...availableTools, ...CALENDAR_TOOLS]
    }
  } catch {}

  const declaredNames = new Set(AGENT_FUNCTION_DECLARATIONS.map((declaration) => declaration.name))
  return availableTools.filter((toolName) => declaredNames.has(toolName))
}

async function issueAgentPlanConfirmToken(
  kv: KVStore,
  plan: AgentPlan,
  userId: string,
): Promise<string | null> {
  if (plan.steps.length === 0) {
    return null
  }

  const secret = getEnv().MISSI_KV_ENCRYPTION_SECRET
  if (!secret) {
    throw new Error("missing_confirm_secret")
  }

  const planHash = nanoid(12)
  const confirmToken = await generateConfirmToken(planHash, userId, secret)
  await storeConfirmToken(kv, confirmToken, plan, userId)
  return confirmToken
}

function normalizePreparedPlan(
  plan: AgentPlan,
  availableTools: string[],
): AgentPlan {
  const availableToolSet = new Set(availableTools)

  const steps = plan.steps
    .filter((step) => availableToolSet.has(step.toolName))
    .map((step, idx) => ({
      ...step,
      stepNumber: idx + 1,
      description: step.description.slice(0, 80) || `Step ${idx + 1}`,
      isDestructive: DESTRUCTIVE_TOOLS.has(step.toolName),
      estimatedDuration: step.estimatedDuration.slice(0, 20) || "~2s",
      args: typeof step.args === "object" && step.args !== null && !Array.isArray(step.args)
        ? step.args
        : {},
    }))

  return {
    ...plan,
    steps,
    summary: plan.summary.slice(0, 100),
    requiresConfirmation: steps.some((step) => step.isDestructive),
    estimatedSteps: steps.length,
  }
}

export async function prepareAgentPlan(
  kv: KVStore,
  userId: string,
  message: string,
  vectorizeEnv: VectorizeEnv | null,
): Promise<PreparedAgentPlanResult> {
  const [memoryContext, availableTools] = await Promise.all([
    loadAgentPlanMemoryContext(kv, vectorizeEnv, userId, message),
    resolveAgentPlanToolNames(kv, userId),
  ])

  const builtPlan = await buildAgentPlan(message, availableTools, memoryContext)
  const plan = normalizePreparedPlan(builtPlan, availableTools)

  try {
    const confirmToken = await issueAgentPlanConfirmToken(kv, plan, userId)
    return {
      ok: true,
      data: { plan, confirmToken },
    }
  } catch (err) {
    if (!(err instanceof Error && err.message === "missing_confirm_secret")) {
      console.error("[agent-plan] Failed to generate/store confirm token:", err)
    }
    return { ok: false, kind: "confirmation_unavailable" }
  }
}
