import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  isLiveRelayRequest,
  syncWorkerStringBindingsToProcessEnv,
} from "@/workers/runtime"

describe("workers/runtime", () => {
  const originalProcess = globalThis.process

  beforeEach(() => {
    Reflect.set(globalThis, "process", originalProcess)
    process.env.MISSI_EXISTING = "kept"
    delete process.env.MISSI_NEW_VALUE
    delete process.env.MISSI_NUMERIC
  })

  afterEach(() => {
    Reflect.set(globalThis, "process", originalProcess)
  })

  it("copies only missing string bindings into process.env", () => {
    syncWorkerStringBindingsToProcessEnv({
      MISSI_EXISTING: "incoming",
      MISSI_NEW_VALUE: "new-value",
      MISSI_NUMERIC: 42,
    })

    expect(process.env.MISSI_EXISTING).toBe("kept")
    expect(process.env.MISSI_NEW_VALUE).toBe("new-value")
    expect(process.env.MISSI_NUMERIC).toBeUndefined()
  })

  it("does nothing when process.env is unavailable", () => {
    Reflect.set(globalThis, "process", undefined)

    expect(() => {
      syncWorkerStringBindingsToProcessEnv({ MISSI_NEW_VALUE: "new-value" })
    }).not.toThrow()
  })

  it("detects the voice relay path from string and URL inputs", () => {
    expect(isLiveRelayRequest("https://missi.space/api/v1/voice-relay?transport=websocket")).toBe(true)
    expect(isLiveRelayRequest(new URL("https://missi.space/api/v1/voice-relay"))).toBe(true)
    expect(isLiveRelayRequest("https://missi.space/api/v1/live-token")).toBe(false)
  })

  afterAll(() => {
    Reflect.set(globalThis, "process", originalProcess)
  })
})
