import { describe, expect, it, vi } from "vitest"
import {
  buildRecentConversationContext,
  getConnectedPluginIds,
  getGreetingMessage,
  getHighPriorityBriefingItem,
  shouldTrackLastInteraction,
} from "@/lib/chat/page-effects"

describe("chat page effect helpers", () => {
  it("builds the recent conversation context from the last 6 entries", () => {
    expect(buildRecentConversationContext([
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
      { role: "assistant", content: "4" },
      { role: "user", content: "5" },
      { role: "assistant", content: "6" },
      { role: "user", content: "7" },
    ])).toBe("assistant: 2\nuser: 3\nassistant: 4\nuser: 5\nassistant: 6\nuser: 7")
  })

  it("selects the first undismissed high-priority briefing item", () => {
    expect(getHighPriorityBriefingItem([
      { type: "habit_check", priority: "medium", message: "medium", actionable: true },
      { type: "goal_nudge", priority: "high", message: "first high", actionable: true },
      { type: "daily_win", priority: "high", message: "dismissed", actionable: true, dismissedAt: 1 },
    ])?.message).toBe("first high")
  })

  it("maps connected plugin ids only", () => {
    expect(getConnectedPluginIds([
      { id: "notion", status: "connected" },
      { id: "google_calendar", status: "error" },
      { id: "webhook", status: "connected" },
    ])).toEqual(["notion", "webhook"])
  })

  it("tracks last interaction only while recording", () => {
    expect(shouldTrackLastInteraction("recording")).toBe(true)
    expect(shouldTrackLastInteraction("thinking")).toBe(false)
  })

  it("produces the expected greeting messages and delay windows", () => {
    expect(getGreetingMessage("Rudra", true)).toEqual({
      message: "Hello Rudra, nice to finally meet you! Let's get started.",
      delayMs: 2000,
    })

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0)
    expect(getGreetingMessage("Rudra", false)).toEqual({
      message: "Hey Rudra! What's up, how's it going?",
      delayMs: 1200,
    })
    randomSpy.mockRestore()
  })
})
