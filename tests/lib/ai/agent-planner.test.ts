import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("nanoid", () => ({
  nanoid: vi.fn(() => "test-plan-id-abc"),
}))

import { buildAgentPlan } from "@/lib/ai/agent-planner"

const AVAILABLE_TOOLS = [
  "searchMemory", "readCalendar", "createCalendarEvent",
  "createNote", "draftEmail", "logExpense", "getWeekSummary",
]

const VALID_GEMINI_RESPONSE = {
  candidates: [{
    content: {
      parts: [{
        text: JSON.stringify({
          steps: [
            { stepNumber: 1, toolName: "readCalendar", description: "Check your calendar", isDestructive: false, estimatedDuration: "~1s", args: { hoursAhead: 48 } },
            { stepNumber: 2, toolName: "createCalendarEvent", description: "Create the event", isDestructive: true, estimatedDuration: "~2s", args: { title: "Meeting", dateTimeISO: "2026-04-16T15:00:00Z" } },
          ],
          summary: "Check calendar then create event",
        }),
      }],
    },
  }],
}

describe("buildAgentPlan", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns a valid plan on a well-formed Gemini response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VALID_GEMINI_RESPONSE), { status: 200 })))

    const plan = await buildAgentPlan("schedule a meeting tomorrow", AVAILABLE_TOOLS, "", "test-key")

    expect(plan.steps).toHaveLength(2)
    expect(plan.steps[0].toolName).toBe("readCalendar")
    expect(plan.steps[1].toolName).toBe("createCalendarEvent")
    expect(plan.summary).toBe("Check calendar then create event")
    expect(plan.planId).toBe("test-plan-id-abc")
    expect(plan.estimatedSteps).toBe(2)
  })

  it("returns zero-step fallback plan when Gemini response is malformed JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: "not valid json {{{{" }] } }],
    }), { status: 200 })))

    const plan = await buildAgentPlan("do something", AVAILABLE_TOOLS, "", "test-key")

    expect(plan.steps).toHaveLength(0)
    expect(plan.requiresConfirmation).toBe(false)
    expect(plan.summary).toBe("I'll take care of that right away")
  })

  it("returns zero-step fallback plan when Gemini times out", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, opts?: { signal?: AbortSignal }) => {
      // Simulate a timeout by returning a promise that only resolves after abort
      return new Promise<Response>((_resolve, reject) => {
        opts?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
      })
    }))

    const plan = await buildAgentPlan("do something", AVAILABLE_TOOLS, "", "test-key")

    expect(plan.steps).toHaveLength(0)
    expect(plan.summary).toBe("I'll take care of that right away")
  }, 6000) // allow 6s for timeout test

  it("sets requiresConfirmation true when any step isDestructive", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(VALID_GEMINI_RESPONSE), { status: 200 })))

    const plan = await buildAgentPlan("schedule a meeting", AVAILABLE_TOOLS, "", "test-key")

    // createCalendarEvent is destructive
    expect(plan.requiresConfirmation).toBe(true)
  })

  it("sets requiresConfirmation false for read-only plans", async () => {
    const readOnlyResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              steps: [
                { stepNumber: 1, toolName: "readCalendar", description: "Read calendar", isDestructive: false, estimatedDuration: "~1s", args: {} },
                { stepNumber: 2, toolName: "getWeekSummary", description: "Get summary", isDestructive: false, estimatedDuration: "~1s", args: {} },
              ],
              summary: "Reading your calendar and week summary",
            }),
          }],
        },
      }],
    }

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(readOnlyResponse), { status: 200 })))

    const plan = await buildAgentPlan("what's on my calendar?", AVAILABLE_TOOLS, "", "test-key")

    expect(plan.requiresConfirmation).toBe(false)
    expect(plan.steps.every(s => !s.isDestructive)).toBe(true)
  })

  it("caps steps at 5 even if Gemini returns more", async () => {
    const tooManySteps = Array.from({ length: 8 }, (_, i) => ({
      stepNumber: i + 1,
      toolName: "searchMemory",
      description: `Step ${i + 1}`,
      isDestructive: false,
      estimatedDuration: "~1s",
      args: {},
    }))
    const manyStepsResponse = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({ steps: tooManySteps, summary: "Many steps" }),
          }],
        },
      }],
    }

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(manyStepsResponse), { status: 200 })))

    const plan = await buildAgentPlan("complex task", AVAILABLE_TOOLS, "", "test-key")

    expect(plan.steps.length).toBeLessThanOrEqual(5)
  })

  it("filters out steps with tool names not in availableTools", async () => {
    const responseWithUnknownTool = {
      candidates: [{
        content: {
          parts: [{
            text: JSON.stringify({
              steps: [
                { stepNumber: 1, toolName: "searchMemory", description: "Search memory", isDestructive: false, estimatedDuration: "~1s", args: {} },
                { stepNumber: 2, toolName: "unknownTool", description: "Unknown action", isDestructive: false, estimatedDuration: "~1s", args: {} },
              ],
              summary: "Search and unknown",
            }),
          }],
        },
      }],
    }

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responseWithUnknownTool), { status: 200 })))

    const plan = await buildAgentPlan("do stuff", AVAILABLE_TOOLS, "", "test-key")

    expect(plan.steps.every(s => AVAILABLE_TOOLS.includes(s.toolName))).toBe(true)
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0].toolName).toBe("searchMemory")
  })
})
