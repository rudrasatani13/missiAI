import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@/lib/ai/agents/tools/types"

const {
  executeBudgetToolMock,
  executeCalendarToolMock,
  executeCommunicationToolMock,
  executeMemoryProductivityToolMock,
  executeSearchToolMock,
} = vi.hoisted(() => ({
  executeBudgetToolMock: vi.fn(),
  executeCalendarToolMock: vi.fn(),
  executeCommunicationToolMock: vi.fn(),
  executeMemoryProductivityToolMock: vi.fn(),
  executeSearchToolMock: vi.fn(),
}))

vi.mock("@/lib/ai/agents/tools/executors/budget", () => ({
  executeBudgetTool: executeBudgetToolMock,
}))

vi.mock("@/lib/ai/agents/tools/executors/calendar", () => ({
  executeCalendarTool: executeCalendarToolMock,
}))

vi.mock("@/lib/ai/agents/tools/executors/communication", () => ({
  executeCommunicationTool: executeCommunicationToolMock,
}))

vi.mock("@/lib/ai/agents/tools/executors/memory", () => ({
  executeMemoryProductivityTool: executeMemoryProductivityToolMock,
}))

vi.mock("@/lib/ai/agents/tools/executors/search", () => ({
  executeSearchTool: executeSearchToolMock,
}))

import { executeAgentTool } from "@/lib/ai/agents/tools/dispatcher"

function makeCtx(): ToolContext {
  return {
    kv: null,
    vectorizeEnv: null,
    userId: "user_test123",
  }
}

describe("agent-tools dispatcher", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeBudgetToolMock.mockResolvedValue({ toolName: "logExpense", status: "done", summary: "budget", output: "budget" })
    executeCalendarToolMock.mockResolvedValue({ toolName: "readCalendar", status: "done", summary: "calendar", output: "calendar" })
    executeCommunicationToolMock.mockResolvedValue({ toolName: "draftEmail", status: "done", summary: "communication", output: "communication" })
    executeMemoryProductivityToolMock.mockResolvedValue({ toolName: "searchMemory", status: "done", summary: "memory", output: "memory" })
    executeSearchToolMock.mockResolvedValue({ toolName: "searchWeb", status: "done", summary: "search", output: "search" })
  })

  it.each([
    ["searchMemory", executeMemoryProductivityToolMock],
    ["createNote", executeMemoryProductivityToolMock],
    ["readCalendar", executeCalendarToolMock],
    ["deleteCalendarEvent", executeCalendarToolMock],
    ["draftEmail", executeCommunicationToolMock],
    ["saveContact", executeCommunicationToolMock],
    ["searchWeb", executeSearchToolMock],
    ["searchNews", executeSearchToolMock],
    ["logExpense", executeBudgetToolMock],
  ])("routes %s to the correct split executor", async (toolName, expectedExecutor) => {
    const result = await executeAgentTool({ name: toolName, args: {} }, makeCtx())

    expect(expectedExecutor).toHaveBeenCalledTimes(1)
    expect(result.status).toBe("done")
  })

  it("returns the stable unknown-tool error without calling any executor", async () => {
    const result = await executeAgentTool({ name: "unknownTool", args: {} }, makeCtx())

    expect(result).toEqual({
      toolName: "unknownTool",
      status: "error",
      summary: 'Unknown tool "unknownTool"',
      output: 'Tool "unknownTool" is not recognized.',
    })
    expect(executeBudgetToolMock).not.toHaveBeenCalled()
    expect(executeCalendarToolMock).not.toHaveBeenCalled()
    expect(executeCommunicationToolMock).not.toHaveBeenCalled()
    expect(executeMemoryProductivityToolMock).not.toHaveBeenCalled()
    expect(executeSearchToolMock).not.toHaveBeenCalled()
  })

  it("preserves the top-level error shape when an executor throws", async () => {
    executeMemoryProductivityToolMock.mockRejectedValueOnce(new Error("boom"))

    const result = await executeAgentTool({ name: "searchMemory", args: {} }, makeCtx())

    expect(result).toEqual({
      toolName: "searchMemory",
      status: "error",
      summary: 'Tool "searchMemory" failed',
      output: 'Error executing searchMemory: boom',
    })
  })
})
