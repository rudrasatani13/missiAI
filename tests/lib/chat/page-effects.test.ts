import { describe, expect, it, vi } from "vitest"
import {
  buildRecentConversationContext,
  getConnectedPluginIds,
  getGreetingMessage,
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
