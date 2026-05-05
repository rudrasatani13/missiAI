/**
 * Agentic Tool Definitions & Executor
 *
 * Defines the function declarations that Gemini can autonomously call,
 * and the executor map that runs them against existing KV / plugin infra.
 */

import type { AgentToolCall, AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"
import { getToolCapability } from "@/lib/ai/agents/tools/registry"
import { executeCalendarTool } from "@/lib/ai/agents/tools/executors/calendar"
import { executeCommunicationTool } from "@/lib/ai/agents/tools/executors/communication"
import { executeMemoryProductivityTool } from "@/lib/ai/agents/tools/executors/memory"
import { executeSearchTool } from "@/lib/ai/agents/tools/executors/search"

// ─── Types ────────────────────────────────────────────────────────────────────

export type { AgentToolCall, AgentStepResult } from "@/lib/ai/agents/tools/types"

// ─── Tool Context ─────────────────────────────────────────────────────────────

export type { ToolContext } from "@/lib/ai/agents/tools/types"

// ─── Gemini Function Declarations ─────────────────────────────────────────────
// These are injected into the Gemini request so the model can autonomously
// decide to call them during a conversation.

export { AGENT_FUNCTION_DECLARATIONS } from "@/lib/ai/agents/tools/declarations"

// ─── Tool Executor ────────────────────────────────────────────────────────────

/**
 * Execute a single tool call from Gemini and return the result.
 *
 * Dispatch is driven by the capability registry's `executorFamily` field.
 * The registry is the single source of truth for which executor handles each
 * tool. Adding a new tool to the registry with an existing family requires
 * no changes here — only new families need a new branch.
 */
export async function executeAgentTool(
  call: AgentToolCall,
  ctx: ToolContext,
): Promise<AgentStepResult> {
  const { name } = call

  try {
    const cap = getToolCapability(name)
    if (!cap) {
      return {
        toolName: name,
        status: "error",
        summary: `Unknown tool "${name}"`,
        output: `Tool "${name}" is not recognized.`,
      }
    }

    switch (cap.executorFamily) {
      case "memory_productivity":
        return (await executeMemoryProductivityTool(call, ctx))!

      case "calendar":
        return (await executeCalendarTool(call, ctx))!

      case "communication":
        return (await executeCommunicationTool(call, ctx))!

      case "search":
        return (await executeSearchTool(call, ctx))!

      default:
        // Exhaustiveness guard — should never happen for registry-backed tools
        return {
          toolName: name,
          status: "error",
          summary: `No executor for tool family "${(cap as any).executorFamily}"`,
          output: `Tool "${name}" has an unrecognized executor family.`,
        }
    }
  } catch (err) {
    return {
      toolName: name,
      status: "error",
      summary: `Tool "${name}" failed`,
      output: `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── Human-readable label for tool names ──────────────────────────────────────

export { getToolLabel } from "@/lib/ai/agents/tools/labels"

