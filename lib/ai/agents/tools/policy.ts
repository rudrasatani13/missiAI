// ─── Agent Tool Policy — derived from registry ───────────────────────────────
//
// CRITICAL (C2 fix): Shared allowlist enforced by EVERY endpoint that runs
// agent tools without a human-in-the-loop confirmation. Prompt-injection via
// voice transcripts, multimodal image text, or Life Graph memory can coerce
// Gemini into emitting any tool call — we MUST block the destructive ones
// before `executeAgentTool()` is invoked.
//
// ALL safety sets below are DERIVED from `lib/ai/agent-tool-registry.ts`.
// Hardcoding a tool name in this file is a bug. If you need to change a tool's
// safety posture, update the registry entry, not these exports.
//
// The only place destructive tools may run from is the agent-confirm flow
// (see `@/lib/ai/agents/confirm.ts`), which requires a single-use, HMAC-signed,
// userId-scoped token that was minted after an explicit user confirmation.

import type { AgentPlanStep } from "@/lib/ai/agents/planner"
import {
  AGENT_SAFE_TOOL_NAMES,
  AGENT_DESTRUCTIVE_TOOL_NAMES,
  AGENT_CONFIRM_EXECUTION_TOOL_NAMES,
  AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES,
  getToolCapability,
  type ToolExecutionSurface,
} from "@/lib/ai/agents/tools/registry"

export {
  AGENT_SAFE_TOOL_NAMES,
  AGENT_DESTRUCTIVE_TOOL_NAMES,
  AGENT_CONFIRM_EXECUTION_TOOL_NAMES,
  AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES,
}

export type AgentToolPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: "destructive" | "unknown" }

export function classifyAgentTool(
  name: string,
  surface: ToolExecutionSurface = "chat_loop",
): AgentToolPolicyDecision {
  const cap = getToolCapability(name)
  if (!cap) {
    return { allowed: false, reason: "unknown" }
  }
  if (!cap.allowedSurfaces.includes(surface)) {
    return { allowed: false, reason: cap.riskClass === "destructive" ? "destructive" : "unknown" }
  }
  return { allowed: true }
}

export function canExecuteConfirmedAgentTool(name: string): boolean {
  return AGENT_CONFIRM_EXECUTION_TOOL_NAMES.has(name)
}

export function shouldExecuteAgentPlanSequentially(
  steps: ReadonlyArray<Pick<AgentPlanStep, "toolName" | "isDestructive">>,
): boolean {
  return steps.some((step) => AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES.has(step.toolName) || step.isDestructive)
}
