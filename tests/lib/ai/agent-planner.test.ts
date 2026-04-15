import { describe, it, expect, vi, beforeEach } from "vitest"
import { buildAgentPlan } from "@/lib/ai/agent-planner"
import { callAIDirect } from "@/services/ai.service"

vi.mock("@/services/ai.service", () => ({
  callAIDirect: vi.fn()
}))

describe("Agent Planner", () => {
  const geminiApiKey = "test-key"
  const memoryContext = "test memory"

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a valid plan when Gemini returns well-formed JSON", async () => {
    vi.mocked(callAIDirect).mockResolvedValueOnce(JSON.stringify({
      steps: [
        { stepNumber: 1, toolName: "searchWeb", description: "Search for info", isDestructive: false, estimatedDuration: "~2s" },
        { stepNumber: 2, toolName: "createCalendarEvent", description: "Create event", isDestructive: true, estimatedDuration: "~2s" }
      ],
      summary: "I'll do a search and create an event",
      requiresConfirmation: true
    }))

    const plan = await buildAgentPlan("search and book", ["searchWeb", "createCalendarEvent"], memoryContext, geminiApiKey)

    expect(plan.steps).toHaveLength(2)
    expect(plan.summary).toBe("I'll do a search and create an event")
    expect(plan.requiresConfirmation).toBe(true) // Should be true because createCalendarEvent is destructive
  })

  it("returns zero-step plan when Gemini response is malformed", async () => {
    vi.mocked(callAIDirect).mockResolvedValueOnce("not valid json")

    const plan = await buildAgentPlan("bad request", ["searchWeb"], memoryContext, geminiApiKey)

    expect(plan.steps).toHaveLength(0)
    expect(plan.summary).toBe("I'll take care of that right away")
  })

  it("returns zero-step plan when Gemini times out", async () => {
    vi.mocked(callAIDirect).mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 5000))) // Wait longer than timeout

    const plan = await buildAgentPlan("timeout request", ["searchWeb"], memoryContext, geminiApiKey)

    expect(plan.steps).toHaveLength(0)
  })

  it("sets requiresConfirmation true if any step is automatically destructive even if model says false", async () => {
    vi.mocked(callAIDirect).mockResolvedValueOnce(JSON.stringify({
      steps: [
        { stepNumber: 1, toolName: "createCalendarEvent", description: "Create event", isDestructive: false, estimatedDuration: "~2s" }
      ],
      summary: "I'll create an event",
      requiresConfirmation: false
    }))

    const plan = await buildAgentPlan("book it", ["createCalendarEvent"], memoryContext, geminiApiKey)

    expect(plan.requiresConfirmation).toBe(true)
    expect(plan.steps[0].isDestructive).toBe(true)
  })

  it("caps steps at maximum 5", async () => {
    vi.mocked(callAIDirect).mockResolvedValueOnce(JSON.stringify({
      steps: Array.from({ length: 10 }).map((_, i) => ({
        stepNumber: i + 1, toolName: "searchWeb", description: "step", isDestructive: false, estimatedDuration: "~1s"
      })),
      summary: "Too many steps",
      requiresConfirmation: false
    }))

    const plan = await buildAgentPlan("lots of steps", ["searchWeb"], memoryContext, geminiApiKey)

    expect(plan.steps).toHaveLength(5)
  })
})
