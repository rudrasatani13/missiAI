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
  buildVoiceMemoryAutoSavePayload,
  getVoiceMemoryAutoSavePrivacyState,
  saveVoiceMemoryBeacon,
  shouldAutoSaveVoiceMemory,
  triggerVoiceMemoryAutoSave,
} from "@/hooks/chat/useVoiceStateMachine"
import type { ConversationEntry } from "@/types/chat"

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("useVoiceStateMachine voice memory autosave helpers", () => {
  it("skips autosave when incognito is enabled", () => {
    expect(
      shouldAutoSaveVoiceMemory({
        userId: "user_123",
        conversationLength: 4,
        incognito: true,
      }),
    ).toBe(false)
  })

  it("requires a signed-in user and minimum conversation length", () => {
    expect(
      shouldAutoSaveVoiceMemory({
        userId: undefined,
        conversationLength: 6,
        incognito: false,
      }),
    ).toBe(false)

    expect(
      shouldAutoSaveVoiceMemory({
        userId: "user_123",
        conversationLength: 3,
        incognito: false,
      }),
    ).toBe(false)

    expect(
      shouldAutoSaveVoiceMemory({
        userId: "user_123",
        conversationLength: 4,
        incognito: false,
      }),
    ).toBe(true)
  })

  it("builds a payload with explicit privacy flags and trimmed conversation entries", () => {
    const conversation: ConversationEntry[] = [
      { role: "user", content: "Hey", timestamp: 1, image: "data:image/png;base64,abc" },
      { role: "assistant", content: "Hi there", timestamp: 2 },
      { role: "user", content: "Remember this", timestamp: 3 },
      { role: "assistant", content: "Okay", timestamp: 4 },
    ]

    expect(JSON.parse(buildVoiceMemoryAutoSavePayload(conversation, false, true))).toEqual({
      conversation: [
        { role: "user", content: "Hey" },
        { role: "assistant", content: "Hi there" },
        { role: "user", content: "Remember this" },
        { role: "assistant", content: "Okay" },
      ],
      interactionCount: 2,
      incognito: false,
      analyticsOptOut: true,
    })
  })

  it("does not auto-save voice memory when incognito is enabled at write time", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    const conversation: ConversationEntry[] = [
      { role: "user", content: "Hey", timestamp: 1 },
      { role: "assistant", content: "Hi there", timestamp: 2 },
      { role: "user", content: "Remember this", timestamp: 3 },
      { role: "assistant", content: "Okay", timestamp: 4 },
    ]

    expect(triggerVoiceMemoryAutoSave({
      userId: "user_123",
      conversation,
      incognitoRef: { current: true },
      analyticsOptOutRef: { current: false },
      fetchImpl: fetchMock,
    })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("does not auto-save voice memory when the conversation is too short", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })

    expect(triggerVoiceMemoryAutoSave({
      userId: "user_123",
      conversation: [
        { role: "user", content: "Hey", timestamp: 1 },
        { role: "assistant", content: "Hi there", timestamp: 2 },
      ],
      incognitoRef: { current: false },
      analyticsOptOutRef: { current: false },
      fetchImpl: fetchMock,
    })).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("auto-saves voice memory with the latest privacy flags when eligible", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    const conversation: ConversationEntry[] = [
      { role: "user", content: "Hey", timestamp: 1 },
      { role: "assistant", content: "Hi there", timestamp: 2 },
      { role: "user", content: "Remember this", timestamp: 3 },
      { role: "assistant", content: "Okay", timestamp: 4 },
    ]

    expect(triggerVoiceMemoryAutoSave({
      userId: "user_123",
      conversation,
      incognitoRef: { current: false },
      analyticsOptOutRef: { current: true },
      fetchImpl: fetchMock,
    })).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/v1/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation: [
          { role: "user", content: "Hey" },
          { role: "assistant", content: "Hi there" },
          { role: "user", content: "Remember this" },
          { role: "assistant", content: "Okay" },
        ],
        interactionCount: 2,
        incognito: false,
        analyticsOptOut: true,
      }),
    })
  })

  it("reads the current incognito and analytics flags from refs at autosave time", () => {
    const incognitoRef = { current: false }
    const analyticsOptOutRef = { current: false }

    expect(
      getVoiceMemoryAutoSavePrivacyState({
        incognitoRef,
        analyticsOptOutRef,
      }),
    ).toEqual({
      incognito: false,
      analyticsOptOut: false,
    })

    incognitoRef.current = true
    analyticsOptOutRef.current = true

    expect(
      getVoiceMemoryAutoSavePrivacyState({
        incognitoRef,
        analyticsOptOutRef,
      }),
    ).toEqual({
      incognito: true,
      analyticsOptOut: true,
    })
  })

  it("does not send the unload memory beacon when incognito is enabled", () => {
    const sendBeaconMock = vi.fn().mockReturnValue(true)
    const conversation: ConversationEntry[] = [
      { role: "user", content: "Hey", timestamp: 1 },
      { role: "assistant", content: "Hi there", timestamp: 2 },
    ]

    expect(saveVoiceMemoryBeacon({
      userId: "user_123",
      conversation,
      incognitoRef: { current: true },
      analyticsOptOutRef: { current: false },
      sendBeacon: sendBeaconMock,
    })).toBe(false)
    expect(sendBeaconMock).not.toHaveBeenCalled()
  })

  it("sends the unload memory beacon when memory writes are allowed", async () => {
    const sendBeaconMock = vi.fn().mockReturnValue(true)
    const conversation: ConversationEntry[] = [
      { role: "user", content: "Hey", timestamp: 1 },
      { role: "assistant", content: "Hi there", timestamp: 2 },
    ]

    expect(saveVoiceMemoryBeacon({
      userId: "user_123",
      conversation,
      incognitoRef: { current: false },
      analyticsOptOutRef: { current: true },
      sendBeacon: sendBeaconMock,
    })).toBe(true)
    expect(sendBeaconMock).toHaveBeenCalledTimes(1)
    const [url, payload] = sendBeaconMock.mock.calls[0]
    expect(url).toBe("/api/v1/memory")
    expect(await (payload as Blob).text()).toBe(JSON.stringify({
      conversation,
      interactionCount: 1,
      analyticsOptOut: true,
    }))
  })

  it("does not send the unload memory beacon without a signed-in user", () => {
    const sendBeaconMock = vi.fn().mockReturnValue(true)

    expect(saveVoiceMemoryBeacon({
      userId: undefined,
      conversation: [
        { role: "user", content: "Hey", timestamp: 1 },
        { role: "assistant", content: "Hi there", timestamp: 2 },
      ],
      incognitoRef: { current: false },
      analyticsOptOutRef: { current: false },
      sendBeacon: sendBeaconMock,
    })).toBe(false)
    expect(sendBeaconMock).not.toHaveBeenCalled()
  })

  it("trims the unload memory beacon payload when the conversation is too large", async () => {
    const sendBeaconMock = vi.fn().mockReturnValue(true)
    const longMessage = "A".repeat(12_000)
    const conversation: ConversationEntry[] = [
      { role: "user", content: longMessage, timestamp: 1 },
      { role: "assistant", content: longMessage, timestamp: 2 },
      { role: "user", content: longMessage, timestamp: 3 },
      { role: "assistant", content: longMessage, timestamp: 4 },
      { role: "user", content: longMessage, timestamp: 5 },
      { role: "assistant", content: longMessage, timestamp: 6 },
      { role: "user", content: longMessage, timestamp: 7 },
      { role: "assistant", content: longMessage, timestamp: 8 },
    ]

    expect(saveVoiceMemoryBeacon({
      userId: "user_123",
      conversation,
      incognitoRef: { current: false },
      analyticsOptOutRef: { current: false },
      sendBeacon: sendBeaconMock,
    })).toBe(true)

    const [, payload] = sendBeaconMock.mock.calls[0]
    const parsed = JSON.parse(await (payload as Blob).text()) as {
      conversation: ConversationEntry[]
      interactionCount: number
      analyticsOptOut?: boolean
    }

    expect(parsed.conversation).toHaveLength(6)
    expect(parsed.conversation).toEqual(conversation.slice(-6))
    expect(parsed.interactionCount).toBe(4)
    expect(parsed.analyticsOptOut).toBeUndefined()
  })
})
