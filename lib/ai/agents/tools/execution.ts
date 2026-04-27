// ─── Agent Tool Guarded Execution ────────────────────────────────────────────
//
// Shared runtime wrapper for all tool execution surfaces.
//
// Provides:
// - Per-tool timeout enforcement (default: 5000ms, overrideable per tool)
// - Consistent error mapping (blocked, timeout, unknown, executor-error)
// - Structured runtime metadata for logging/observability
// - Preserved result shapes across chat-stream, live-execute, and confirmed execution

import { executeAgentTool } from "@/lib/ai/agents/tools/dispatcher"
import { getToolCapability, type ToolCapability, type ToolExecutionSurface } from "@/lib/ai/agents/tools/registry"
import type { AgentToolCall, AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"
import { classifyAgentTool } from "@/lib/ai/agents/tools/policy"
import { logError } from "@/lib/server/observability/logger"

const DEFAULT_TOOL_TIMEOUT_MS = 5000

export type ToolExecutionOutcome =
  | { kind: "success"; result: AgentStepResult }
  | { kind: "blocked"; reason: "destructive" | "unknown"; result: AgentStepResult }
  | { kind: "timeout"; result: AgentStepResult }
  | { kind: "error"; result: AgentStepResult }

export interface GuardedExecutionResult {
  result: AgentStepResult
  outcome: ToolExecutionOutcome["kind"]
  metadata: {
    toolName: string
    durationMs: number
    timedOut: boolean
    threw: boolean
    blocked: boolean
    executorFamily?: string
  }
}

function makeTimeoutResult(toolName: string): AgentStepResult {
  return {
    toolName,
    status: "error",
    summary: "Tool execution timed out",
    output: "This action took too long to complete. Please try again.",
  }
}

function makeBlockedResult(toolName: string, reason: "destructive" | "unknown"): AgentStepResult {
  return {
    toolName,
    status: "error",
    summary: "Tool blocked by policy",
    output:
      reason === "destructive"
        ? "This action requires explicit user confirmation and cannot be performed in this channel. Use the confirmation flow instead."
        : "That tool is not available in this channel.",
  }
}

function makeErrorResult(toolName: string, err: unknown): AgentStepResult {
  return {
    toolName,
    status: "error",
    summary: "Tool execution failed",
    output: `Error executing ${toolName}: ${err instanceof Error ? err.message : String(err)}`,
  }
}

/**
 * Execute a tool with policy checks, timeout enforcement, and structured error handling.
 *
 * This is the single entry point that all tool execution surfaces should use
 * (chat-stream, live-execute, confirmed execution) to ensure consistent
 * timeout, blocking, and error behavior.
 */
export async function executeToolGuarded(
  call: AgentToolCall,
  ctx: ToolContext,
  options?: {
    /** Override default timeout (ms). Falls back to tool-specific timeout from registry, then 5000ms. */
    timeoutMs?: number
    /** User ID for logging */
    userId?: string
    /** Log key prefix for structured logging */
    logPrefix?: string
    executionSurface?: ToolExecutionSurface
    /** Override blocked-tool log event key */
    blockedLogEvent?: string
    /** Override blocked-tool log message */
    blockedLogMessage?: string
  },
): Promise<GuardedExecutionResult> {
  const startTime = Date.now()
  const { name: toolName, args } = call
  const logPrefix = options?.logPrefix ?? "tool.guarded"
  const userId = options?.userId ?? "unknown"
  const executionSurface = options?.executionSurface ?? "chat_loop"

  // 1. Policy check (blocked tools)
  const policy = classifyAgentTool(toolName, executionSurface)
  if (!policy.allowed) {
    const result = makeBlockedResult(toolName, policy.reason)
    logError(
      options?.blockedLogEvent ?? `${logPrefix}.blocked`,
      options?.blockedLogMessage ?? `Blocked ${policy.reason} tool "${toolName}"`,
      userId,
    )
    return {
      result,
      outcome: "blocked",
      metadata: {
        toolName,
        durationMs: 0,
        timedOut: false,
        threw: false,
        blocked: true,
      },
    }
  }

  // 2. Resolve timeout
  const cap: ToolCapability | undefined = getToolCapability(toolName)
  const timeoutMs = options?.timeoutMs ?? cap?.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS

  // 3. Execute with timeout race
  let timedOut = false
  let executorError: unknown | null = null
  let threw = false
  const abortController = new AbortController()
  const parentAbortSignal = ctx.abortSignal
  const abortFromParent = () => abortController.abort()
  if (parentAbortSignal?.aborted) {
    abortController.abort()
  } else {
    parentAbortSignal?.addEventListener("abort", abortFromParent, { once: true })
  }

  const executePromise = executeAgentTool(
    { name: toolName, args },
    { ...ctx, executionSurface, abortSignal: abortController.signal },
  ).catch((err) => {
    executorError = err
    threw = true
    return makeErrorResult(toolName, err)
  })

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeoutPromise = new Promise<AgentStepResult>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true
      abortController.abort()
      resolve(makeTimeoutResult(toolName))
    }, timeoutMs)
  })

  const result = await Promise.race([executePromise, timeoutPromise])
  if (timeoutId) clearTimeout(timeoutId)
  parentAbortSignal?.removeEventListener("abort", abortFromParent)

  // If timeout won, we still need to let the real execution finish in background
  // but we return the timeout result immediately
  if (timedOut) {
    logError(`${logPrefix}.timeout`, `Tool "${toolName}" timed out after ${timeoutMs}ms`, userId)
  } else if (executorError) {
    logError(`${logPrefix}.error`, executorError, userId)
  }

  const durationMs = Date.now() - startTime

  let outcome: ToolExecutionOutcome["kind"] = "success"
  if (timedOut) outcome = "timeout"
  else if (result.status === "error") outcome = "error"

  return {
    result,
    outcome,
    metadata: {
      toolName,
      durationMs,
      timedOut,
      threw,
      blocked: false,
      executorFamily: cap?.executorFamily,
    },
  }
}
