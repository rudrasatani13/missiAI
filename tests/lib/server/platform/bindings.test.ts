import { beforeEach, describe, expect, it, vi } from "vitest"

const { getCloudflareContextMock } = vi.hoisted(() => ({
  getCloudflareContextMock: vi.fn(),
}))

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: getCloudflareContextMock,
}))

import {
  getCloudflareBindings,
  getCloudflareD1Binding,
  getCloudflareExecutionContext,
} from "@/lib/server/platform/bindings"
import {
  getCloudflareBindingsAsync,
  getCloudflareD1BindingAsync,
} from "@/lib/server/platform/bindings-async"

function makeDb() {
  return {
    prepare: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  }
}

describe("server bindings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCloudflareContextMock.mockReset()
  })

  it("returns the D1 binding from MISSI_DB", () => {
    const db = makeDb()
    const waitUntil = vi.fn()
    const env = { MISSI_DB: db }
    getCloudflareContextMock.mockReturnValue({ env, ctx: { waitUntil } })

    expect(getCloudflareBindings()).toBe(env)
    expect(getCloudflareD1Binding()).toBe(db)
    expect(getCloudflareExecutionContext()).toEqual({ waitUntil })
  })

  it("falls back to MISSI_PRIMARY_DB and DB when resolving D1", () => {
    const primaryDb = makeDb()
    const fallbackDb = makeDb()

    getCloudflareContextMock.mockReturnValueOnce({ env: { MISSI_PRIMARY_DB: primaryDb } })
    expect(getCloudflareD1Binding()).toBe(primaryDb)

    getCloudflareContextMock.mockReturnValueOnce({ env: { DB: fallbackDb } })
    expect(getCloudflareD1Binding()).toBe(fallbackDb)
  })

  it("returns null when sync bindings are unavailable", () => {
    getCloudflareContextMock.mockImplementationOnce(() => {
      throw new Error("no context")
    })

    expect(getCloudflareBindings()).toBeNull()
    expect(getCloudflareD1Binding()).toBeNull()
  })

  it("resolves async bindings and D1 fallback names", async () => {
    const db = makeDb()
    const env = { DB: db }
    getCloudflareContextMock.mockReturnValueOnce({ env })
    await expect(getCloudflareBindingsAsync()).resolves.toBe(env)

    getCloudflareContextMock.mockReturnValueOnce({ env })
    await expect(getCloudflareD1BindingAsync()).resolves.toBe(db)
  })

  it("returns null for async bindings when context is unavailable", async () => {
    getCloudflareContextMock.mockImplementationOnce(() => {
      throw new Error("no async context")
    })
    await expect(getCloudflareBindingsAsync()).resolves.toBeNull()

    getCloudflareContextMock.mockImplementationOnce(() => {
      throw new Error("no async context")
    })
    await expect(getCloudflareD1BindingAsync()).resolves.toBeNull()
  })
})
