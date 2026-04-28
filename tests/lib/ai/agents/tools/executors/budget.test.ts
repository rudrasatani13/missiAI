import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ToolContext } from "@/lib/ai/agents/tools/types"
import type { KVStore } from "@/types"

const { addExpenseEntryMock, addOrUpdateNodeMock, nanoidMock } = vi.hoisted(() => ({
  addExpenseEntryMock: vi.fn(),
  addOrUpdateNodeMock: vi.fn(),
  nanoidMock: vi.fn(),
}))

vi.mock("nanoid", () => ({
  nanoid: nanoidMock,
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

  it("generates entry ID using secure nanoid randomness", async () => {
    nanoidMock.mockReturnValue("secure123")
    const now = 1714224000000 // Fixed timestamp
    vi.useFakeTimers()
    vi.setSystemTime(now)

    await executeBudgetTool({
      name: "logExpense",
      args: { amount: 50, currency: "USD", category: "shopping", description: "Shoes" },
    }, makeCtx())

    expect(addExpenseEntryMock).toHaveBeenCalledWith(
      expect.anything(),
      "user_test123",
      expect.objectContaining({
        id: `bgt-${now.toString(36)}-secure123`,
      }),
    )

    expect(nanoidMock).toHaveBeenCalledWith(6)
    vi.useRealTimers()
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
