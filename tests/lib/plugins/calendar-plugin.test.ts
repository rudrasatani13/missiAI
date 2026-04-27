import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { callGeminiDirectMock } = vi.hoisted(() => ({
  callGeminiDirectMock: vi.fn(),
}))

vi.mock("@/lib/ai/services/ai-service", () => ({
  callGeminiDirect: callGeminiDirectMock,
}))

import { createCalendarEvent, parseEventFromCommand } from "@/lib/plugins/calendar-plugin"

describe("calendar-plugin", () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns parsed event details when AI returns valid JSON", async () => {
    callGeminiDirectMock.mockResolvedValueOnce(JSON.stringify({
      title: "Team Sync",
      startDateTime: "2026-04-27T10:00:00Z",
      endDateTime: "2026-04-27T11:00:00Z",
      description: "Weekly sync",
    }))

    await expect(parseEventFromCommand("schedule a team sync tomorrow morning")).resolves.toEqual({
      title: "Team Sync",
      startDateTime: "2026-04-27T10:00:00Z",
      endDateTime: "2026-04-27T11:00:00Z",
      description: "Weekly sync",
    })
  })

  it("returns empty defaults when AI returns a malformed event payload", async () => {
    callGeminiDirectMock.mockResolvedValueOnce(JSON.stringify(["bad-payload"]))

    await expect(parseEventFromCommand("schedule something tomorrow")).resolves.toEqual({
      title: "",
      startDateTime: "",
      endDateTime: "",
      description: "",
    })
  })

  it("returns a success result with url when Google Calendar returns a valid response shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ htmlLink: "https://calendar.google.com/event?eid=abc" }),
    })

    await expect(createCalendarEvent("token", "primary", {
      title: "Team Sync",
      startDateTime: "2026-04-27T10:00:00Z",
      endDateTime: "2026-04-27T11:00:00Z",
      description: "Weekly sync",
    })).resolves.toEqual(expect.objectContaining({
      success: true,
      url: "https://calendar.google.com/event?eid=abc",
    }))
  })

  it("returns a failure result when Google Calendar returns an invalid response shape", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ htmlLink: 123 }),
    })

    await expect(createCalendarEvent("token", "primary", {
      title: "Team Sync",
      startDateTime: "2026-04-27T10:00:00Z",
      endDateTime: "2026-04-27T11:00:00Z",
      description: "Weekly sync",
    })).resolves.toEqual(expect.objectContaining({
      success: false,
      output: "Couldn't create calendar event. Try again.",
    }))
  })
})
