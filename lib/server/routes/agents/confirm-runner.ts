import { nanoid } from "nanoid"
import type { AgentPlan } from "@/lib/ai/agents/planner"
import { saveAgentHistory } from "@/lib/ai/agents/history"
import { executeToolGuarded } from "@/lib/ai/agents/tools/execution"
import { canExecuteConfirmedAgentTool, shouldExecuteAgentPlanSequentially } from "@/lib/ai/agents/tools/policy"
import type { ToolContext } from "@/lib/ai/agents/tools/types"
import { awardXP } from "@/lib/gamification/xp-engine"
import type { KVStore } from "@/types"

export interface ConfirmedAgentExecutionOptions {
  kv: KVStore
  userId: string
  plan: AgentPlan
  ctx: ToolContext
  send: (data: Record<string, unknown>) => void
}

function buildConfirmedExecutionStatus(
  plan: AgentPlan,
  stepsCompleted: number,
): "completed" | "partial" | "cancelled" {
  return stepsCompleted === plan.steps.length ? "completed" : stepsCompleted > 0 ? "partial" : "cancelled"
}

async function executeConfirmedAgentStep(
  step: AgentPlan["steps"][number],
  ctx: ToolContext,
  kv: KVStore,
  userId: string,
  send: (data: Record<string, unknown>) => void,
): Promise<boolean> {
  if (!canExecuteConfirmedAgentTool(step.toolName)) {
    send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool not available" })
    return false
  }

  send({ type: "step_start", stepNumber: step.stepNumber, description: step.description })

  const guardedResult = await executeToolGuarded(
    { name: step.toolName, args: step.args ?? {} },
    ctx,
    { userId, logPrefix: "agent-confirm", executionSurface: "confirmed_agent" },
  )

  if (guardedResult.metadata.threw) {
    send({ type: "step_error", stepNumber: step.stepNumber, error: "Tool execution failed" })
    return false
  }

  const result = guardedResult.result
  send({
    type: "step_done",
    stepNumber: step.stepNumber,
    summary: result.summary,
    output: result.output,
    status: result.status,
  })

  if (result.status === "done") {
    awardXP(kv, userId, "agent", 2).catch(() => {})
    return true
  }

  return false
}

export async function runConfirmedAgentExecution(
  options: ConfirmedAgentExecutionOptions,
): Promise<void> {
  const { kv, userId, plan, ctx, send } = options
  let stepsCompleted = 0

  const executeStep = async (step: AgentPlan["steps"][number]) => {
    if (await executeConfirmedAgentStep(step, ctx, kv, userId, send)) {
      stepsCompleted++
    }
  }

  if (shouldExecuteAgentPlanSequentially(plan.steps)) {
    for (const step of plan.steps) {
      await executeStep(step)
    }
  } else {
    await Promise.all(plan.steps.map((step) => executeStep(step)))
  }

  const finalStatus = buildConfirmedExecutionStatus(plan, stepsCompleted)
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
    summary: stepsCompleted > 0 ? `Done! Completed ${stepsCompleted} of ${plan.steps.length} steps.` : "No steps could be completed.",
    stepsCompleted,
    status: finalStatus,
  })
}
