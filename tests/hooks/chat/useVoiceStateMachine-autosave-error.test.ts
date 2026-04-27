import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { toastErrorMock } = vi.hoisted(() => ({
  toastErrorMock: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    error: toastErrorMock,
  },
}))

import {
  buildVoiceMemoryAutoSaveErrorPayload,
  reportVoiceMemoryAutoSaveFailure,
} from "@/hooks/chat/useVoiceStateMachine"

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useVoiceStateMachine autosave error helpers", () => {
  it("builds a structured autosave error payload without conversation content", () => {
    expect(JSON.parse(buildVoiceMemoryAutoSaveErrorPayload({
      error: new Error("network down"),
      conversationLength: 6,
      interactionCount: 3,
    }))).toEqual({
      event: "voice_memory_autosave_error",
      message: "network down",
      metadata: {
        conversationLength: 6,
        interactionCount: 3,
      },
    })
  })

  it("shows a toast and reports telemetry when voice memory autosave fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", fetchMock)

    await reportVoiceMemoryAutoSaveFailure({
      error: new Error("network down"),
      conversationLength: 6,
      interactionCount: 3,
    })

    expect(toastErrorMock).toHaveBeenCalledWith("Couldn't save this conversation to memory.", {
      id: "voice-memory-autosave-error",
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/v1/client-errors")
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
    })
    expect(JSON.parse(init.body as string)).toEqual({
      event: "voice_memory_autosave_error",
      message: "network down",
      metadata: {
        conversationLength: 6,
        interactionCount: 3,
      },
    })
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[voice-memory-autosave] Failed to save conversation memory",
      expect.any(Error),
    )
    consoleErrorSpy.mockRestore()
  })
})
