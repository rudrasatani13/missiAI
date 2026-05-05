import { describe, expect, it } from "vitest"
import {
  formatMemoryNodesForChat,
  getBootFlowState,
  isChatSetupComplete,
} from "@/lib/chat/page-lifecycle"

describe("chat page lifecycle helpers", () => {
  it("detects setup completion from Clerk metadata or local completion", () => {
    expect(isChatSetupComplete(true, false)).toBe(true)
    expect(isChatSetupComplete(false, true)).toBe(true)
    expect(isChatSetupComplete(undefined, false)).toBe(false)
  })

  it("derives the initial boot flow state", () => {
    expect(getBootFlowState(true, true)).toEqual({ showBootSequence: true, bootCompleted: false })
    expect(getBootFlowState(false, false)).toEqual({ showBootSequence: true, bootCompleted: false })
    expect(getBootFlowState(false, true)).toEqual({ showBootSequence: false, bootCompleted: true })
  })

  it("formats fetched memory nodes into chat context text", () => {
    expect(formatMemoryNodesForChat([
      { category: "goal", title: "Run 5k", detail: "Training every week" },
      { category: "habit", title: "Meditate", detail: "10 min mornings" },
    ])).toBe("goal: Run 5k — Training every week\nhabit: Meditate — 10 min mornings")
  })
})
