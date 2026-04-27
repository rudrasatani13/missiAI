import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@/lib/ai/agents/tools/types"
import type { KVStore } from "@/types"

const { addExpenseEntryMock, addOrUpdateNodeMock } = vi.hoisted(() => ({
  addExpenseEntryMock: vi.fn(),
  addOrUpdateNodeMock: vi.fn(),
}))

vi.mock("@/lib/budget/budget-store", () => ({
  addExpenseEntry: addExpenseEntryMock,
}))

vi.mock("@/lib/memory/life-graph", () => ({
  addOrUpdateNode: addOrUpdateNodeMock,
}))

import { executeBudgetTool } from "@/lib/ai/agents/tools/executors/budget"

function makeKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => undefined),
  }
}

function makeCtx(): ToolContext {
  return {
    kv: makeKV(),
    vectorizeEnv: null,
    userId: "user_test123",
  }
}

describe("executeBudgetTool", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    addExpenseEntryMock.mockResolvedValue(undefined)
    addOrUpdateNodeMock.mockResolvedValue({ id: "node_123" })
  })

  it("rejects unsupported currencies using the shared budget allowlist", async () => {
    const result = await executeBudgetTool({
      name: "logExpense",
      args: { amount: 12, currency: "DOGE", category: "food", description: "Lunch" },
    }, makeCtx())

    expect(result).toEqual({
      toolName: "logExpense",
      status: "error",
      summary: "Unsupported currency",
      output: "Please provide a supported currency code.",
    })
    expect(addExpenseEntryMock).not.toHaveBeenCalled()
    expect(addOrUpdateNodeMock).not.toHaveBeenCalled()
  })

  it("accepts supported currencies and logs the expense", async () => {
    const result = await executeBudgetTool({
      name: "logExpense",
      args: { amount: 12, currency: "usd", category: "food", description: "Lunch" },
    }, makeCtx())

    expect(result?.status).toBe("done")
    expect(addExpenseEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      "user_test123",
      expect.objectContaining({ currency: "USD", amount: 12 }),
    )
    expect(addOrUpdateNodeMock).toHaveBeenCalled()
  })

  it("does not write expense entries when execution is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()

    const result = await executeBudgetTool({
      name: "logExpense",
      args: { amount: 12, currency: "USD", category: "food", description: "Lunch" },
    }, { ...makeCtx(), abortSignal: controller.signal })

    expect(result).toEqual({
      toolName: "logExpense",
      status: "error",
      summary: "Tool execution cancelled",
      output: "This action timed out before it could safely complete.",
    })
    expect(addExpenseEntryMock).not.toHaveBeenCalled()
    expect(addOrUpdateNodeMock).not.toHaveBeenCalled()
  })
})
