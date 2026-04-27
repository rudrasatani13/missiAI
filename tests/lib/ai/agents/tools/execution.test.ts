import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@/lib/ai/agents/tools/types"

const {
  executeAgentToolMock,
  logErrorMock,
} = vi.hoisted(() => ({
  executeAgentToolMock: vi.fn(),
  logErrorMock: vi.fn(),
}))

vi.mock("@/lib/ai/agents/tools/dispatcher", () => ({
  executeAgentTool: executeAgentToolMock,
}))

vi.mock("@/lib/server/observability/logger", () => ({
  logError: logErrorMock,
}))

import { executeToolGuarded } from "@/lib/ai/agents/tools/execution"

function makeCtx(): ToolContext {
  return {
    kv: null,
    vectorizeEnv: null,
    userId: "user_test123",
  }
}

describe("agent-tool-execution", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns blocked result and never calls executor for destructive tools", async () => {
    const result = await executeToolGuarded(
      { name: "deleteCalendarEvent", args: {} },
      makeCtx(),
      {
        userId: "user_test123",
        logPrefix: "chat_stream",
        blockedLogEvent: "chat_stream.tool_blocked",
        blockedLogMessage: 'Blocked destructive tool "deleteCalendarEvent" from agent loop',
      },
    )

    expect(executeAgentToolMock).not.toHaveBeenCalled()
    expect(result.outcome).toBe("blocked")
    expect(result.result).toEqual({
      toolName: "deleteCalendarEvent",
      status: "error",
      summary: "Tool blocked by policy",
      output:
        "This action requires explicit user confirmation and cannot be performed in this channel. Use the confirmation flow instead.",
    })
    expect(result.metadata).toMatchObject({
      toolName: "deleteCalendarEvent",
      blocked: true,
      timedOut: false,
      threw: false,
    })
    expect(logErrorMock).toHaveBeenCalledWith(
      "chat_stream.tool_blocked",
      'Blocked destructive tool "deleteCalendarEvent" from agent loop',
      "user_test123",
    )
  })

  it("allows destructive tools on the confirmed-agent surface", async () => {
    executeAgentToolMock.mockResolvedValueOnce({
      toolName: "deleteCalendarEvent",
      status: "done",
      summary: "Deleted event",
      output: "Done.",
    })

    const result = await executeToolGuarded(
      { name: "deleteCalendarEvent", args: {} },
      makeCtx(),
      { userId: "user_test123", logPrefix: "agent-confirm", executionSurface: "confirmed_agent" },
    )

    expect(executeAgentToolMock).toHaveBeenCalledWith(
      { name: "deleteCalendarEvent", args: {} },
      expect.objectContaining({ executionSurface: "confirmed_agent" }),
    )
    expect(result.outcome).toBe("success")
    expect(result.metadata).toMatchObject({
      toolName: "deleteCalendarEvent",
      blocked: false,
      executorFamily: "calendar",
    })
  })

  it("returns timeout result when execution exceeds timeout budget", async () => {
    vi.useFakeTimers()
    let receivedSignal: AbortSignal | undefined
    executeAgentToolMock.mockImplementationOnce((_, ctx: ToolContext) => {
      receivedSignal = ctx.abortSignal
      return new Promise(() => {})
    })

    const pending = executeToolGuarded(
      { name: "searchMemory", args: { query: "rent" } },
      makeCtx(),
      { userId: "user_test123", logPrefix: "tools-execute", timeoutMs: 25 },
    )

    await vi.advanceTimersByTimeAsync(25)
    const result = await pending

    expect(result.outcome).toBe("timeout")
    expect(result.result).toEqual({
      toolName: "searchMemory",
      status: "error",
      summary: "Tool execution timed out",
      output: "This action took too long to complete. Please try again.",
    })
    expect(result.metadata).toMatchObject({
      toolName: "searchMemory",
      timedOut: true,
      threw: false,
      blocked: false,
    })
    expect(logErrorMock).toHaveBeenCalledWith(
      "tools-execute.timeout",
      'Tool "searchMemory" timed out after 25ms',
      "user_test123",
    )
    expect(receivedSignal?.aborted).toBe(true)
  })

  it("captures thrown executor failures while preserving error result shape", async () => {
    executeAgentToolMock.mockRejectedValueOnce(new Error("boom"))

    const result = await executeToolGuarded(
      { name: "searchMemory", args: { query: "rent" } },
      makeCtx(),
      { userId: "user_test123", logPrefix: "agent-confirm" },
    )

    expect(result.outcome).toBe("error")
    expect(result.result).toEqual({
      toolName: "searchMemory",
      status: "error",
      summary: "Tool execution failed",
      output: "Error executing searchMemory: boom",
    })
    expect(result.metadata).toMatchObject({
      toolName: "searchMemory",
      timedOut: false,
      threw: true,
      blocked: false,
      executorFamily: "memory_productivity",
    })
    expect(logErrorMock).toHaveBeenCalledWith(
      "agent-confirm.error",
      new Error("boom"),
      "user_test123",
    )
  })

  it("returns successful result metadata for normal execution", async () => {
    executeAgentToolMock.mockResolvedValueOnce({
      toolName: "searchWeb",
      status: "done",
      summary: "Found results",
      output: "Done.",
    })

    const result = await executeToolGuarded(
      { name: "searchWeb", args: { query: "weather" } },
      makeCtx(),
      { userId: "user_test123", logPrefix: "tools-execute" },
    )

    expect(result.outcome).toBe("success")
    expect(result.result).toEqual({
      toolName: "searchWeb",
      status: "done",
      summary: "Found results",
      output: "Done.",
    })
    expect(result.metadata).toMatchObject({
      toolName: "searchWeb",
      timedOut: false,
      threw: false,
      blocked: false,
      executorFamily: "search",
    })
    expect(logErrorMock).not.toHaveBeenCalled()
  })
})
