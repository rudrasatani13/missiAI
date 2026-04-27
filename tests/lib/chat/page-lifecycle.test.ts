import { describe, expect, it } from "vitest"
import {
  formatMemoryNodesForChat,
  getAvatarFetchDelayMs,
  getBootFlowState,
  getTierSafePersonality,
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

  it("falls back to assistant when a premium personality is locked by plan", () => {
    expect(getTierSafePersonality("professional", "free")).toBe("assistant")
    expect(getTierSafePersonality("mentor", undefined)).toBe("assistant")
    expect(getTierSafePersonality("assistant", "free")).toBe("assistant")
    expect(getTierSafePersonality("professional", "plus")).toBe("professional")
  })

  it("uses the correct avatar fetch delay for local dev vs full bootstrap", () => {
    expect(getAvatarFetchDelayMs(true)).toBe(0)
    expect(getAvatarFetchDelayMs(false)).toBe(6000)
  })
})
