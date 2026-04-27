import { describe, it, expect, vi, beforeEach } from "vitest"
import { executeAction } from "@/lib/actions/action-executor"
import type { ActionIntent } from "@/types/actions"

// Mock callAIDirect
vi.mock("@/lib/ai/services/ai-service", () => ({
  callGeminiDirect: vi.fn(),
}))

import { callGeminiDirect as callAIDirect } from "@/lib/ai/services/ai-service"

const mockedCallAIDirect = vi.mocked(callAIDirect)

function makeIntent(overrides: Partial<ActionIntent>): ActionIntent {
  return {
    type: "none",
    confidence: 0.9,
    parameters: {},
    rawUserMessage: "test",
    ...overrides,
  }
}

describe("action-executor", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("web_search", () => {
    it("should return a successful web search result", async () => {
      mockedCallAIDirect.mockResolvedValueOnce(
        "Flights to Goa from Delhi start at around INR 3,500 one-way. Multiple airlines operate daily routes.",
      )

      const result = await executeAction(
        makeIntent({
          type: "web_search",
          parameters: { query: "flights to Goa" },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.type).toBe("web_search")
      expect(result.output.length).toBeLessThanOrEqual(300)
      expect(result.actionTaken).toContain("Searched for")
      expect(result.canUndo).toBe(false)
    })

    it("should call callAIDirect with useGoogleSearch: true", async () => {
      mockedCallAIDirect.mockResolvedValueOnce("Some search result")

      await executeAction(
        makeIntent({
          type: "web_search",
          parameters: { query: "test query" },
        }),
      )

      expect(mockedCallAIDirect).toHaveBeenCalledWith(
        expect.any(String),
        "test query",
        expect.objectContaining({ useGoogleSearch: true }),
      )
    })
  })

  describe("calculate", () => {
    it('should calculate "2 + 2" correctly', async () => {
      const result = await executeAction(
        makeIntent({
          type: "calculate",
          parameters: { expression: "2 + 2" },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain("4")
      expect(result.type).toBe("calculate")
    })

    it("should handle percentage calculations", async () => {
      const result = await executeAction(
        makeIntent({
          type: "calculate",
          parameters: { expression: "15% of 2400" },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain("360")
    })

    it("should handle multiplication", async () => {
      const result = await executeAction(
        makeIntent({
          type: "calculate",
          parameters: { expression: "12 * 5" },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain("60")
    })

    it("should fall back to AI for complex expressions", async () => {
      mockedCallAIDirect.mockResolvedValueOnce("42")

      const result = await executeAction(
        makeIntent({
          type: "calculate",
          parameters: { expression: "the integral of 2x from 0 to 3" },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.output).toContain("42")
    })
  })

  describe("draft_email", () => {
    it("should draft an email via AI", async () => {
      mockedCallAIDirect.mockResolvedValueOnce(
        "Dear Manager, I am writing to request leave for next week. I have completed all pending tasks and ensured proper handover.",
      )

      const result = await executeAction(
        makeIntent({
          type: "draft_email",
          parameters: {
            to: "manager",
            subject: "leave request",
            tone: "professional",
            keyPoints: "need leave next week",
          },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.type).toBe("draft_email")
      expect(result.data?.fullDraft).toBeTruthy()
      expect(result.data?.to).toBe("manager")
      expect(result.actionTaken).toContain("Drafted email")
    })
  })

  describe("set_reminder", () => {
    it("should return a reminder result without AI call", async () => {
      const result = await executeAction(
        makeIntent({
          type: "set_reminder",
          parameters: { task: "call dentist", time: "tomorrow 10am" },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.type).toBe("set_reminder")
      expect(result.output).toContain("call dentist")
      expect(result.canUndo).toBe(true)
      expect(result.data?.task).toBe("call dentist")
      expect(mockedCallAIDirect).not.toHaveBeenCalled()
    })
  })

  describe("take_note", () => {
    it("should return a note result without AI call", async () => {
      const result = await executeAction(
        makeIntent({
          type: "take_note",
          parameters: { title: "Meeting notes", content: "Discussed Q4 targets" },
        }),
      )

      expect(result.success).toBe(true)
      expect(result.type).toBe("take_note")
      expect(result.output).toContain("Meeting notes")
      expect(result.canUndo).toBe(true)
      expect(mockedCallAIDirect).not.toHaveBeenCalled()
    })
  })

  describe("error handling", () => {
    it("should return failure result when callAIDirect throws", async () => {
      mockedCallAIDirect.mockRejectedValueOnce(new Error("Network error"))

      const result = await executeAction(
        makeIntent({
          type: "web_search",
          parameters: { query: "test" },
        }),
      )

      expect(result.success).toBe(false)
      expect(result.output).toBe("Action failed. Try again.")
    })
  })

  describe("all results", () => {
    it("should have executedAt timestamp on successful result", async () => {
      const before = Date.now()
      const result = await executeAction(
        makeIntent({
          type: "set_reminder",
          parameters: { task: "test", time: "now" },
        }),
      )
      const after = Date.now()

      expect(result.executedAt).toBeGreaterThanOrEqual(before)
      expect(result.executedAt).toBeLessThanOrEqual(after)
    })

    it("should have executedAt on failure result", async () => {
      mockedCallAIDirect.mockRejectedValueOnce(new Error("fail"))

      const before = Date.now()
      const result = await executeAction(
        makeIntent({
          type: "translate",
          parameters: { text: "hi", targetLanguage: "Spanish" },
        }),
      )
      const after = Date.now()

      expect(result.executedAt).toBeGreaterThanOrEqual(before)
      expect(result.executedAt).toBeLessThanOrEqual(after)
    })

    it("should truncate output to 300 chars max", async () => {
      const longText = "A".repeat(500)
      mockedCallAIDirect.mockResolvedValueOnce(longText)

      const result = await executeAction(
        makeIntent({
          type: "web_search",
          parameters: { query: "test" },
        }),
      )

      expect(result.output.length).toBeLessThanOrEqual(300)
    })
  })
})
