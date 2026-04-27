import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  openNextFetchMock,
  handleLiveWsMock,
} = vi.hoisted(() => ({
  openNextFetchMock: vi.fn(),
  handleLiveWsMock: vi.fn(),
}))

vi.mock("../../.open-next/worker.js", () => ({
  default: {
    fetch: openNextFetchMock,
  },
  DOQueueHandler: class {},
  DOShardedTagCache: class {},
  BucketCachePurge: class {},
}))

vi.mock("@/workers/live/handler", () => ({
  handleLiveWs: handleLiveWsMock,
}))

import workerEntry from "@/workers/entry"

describe("workers/entry", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    openNextFetchMock.mockResolvedValue(new Response("open-next", { status: 200 }))
    handleLiveWsMock.mockResolvedValue(new Response("relay", { status: 200 }))
    process.env.MISSI_EXISTING = "existing"
    delete process.env.MISSI_ADDED_FROM_ENV
  })

  it("routes voice relay requests to the live websocket handler and syncs string env bindings", async () => {
    const env = {
      MISSI_EXISTING: "incoming-existing",
      MISSI_ADDED_FROM_ENV: "incoming-added",
      NON_STRING: 42,
    }
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }
    const request = new Request("https://missi.space/api/v1/voice-relay")

    const response = await workerEntry.fetch(request, env, ctx)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("relay")
    expect(handleLiveWsMock).toHaveBeenCalledWith(request, env, ctx)
    expect(openNextFetchMock).not.toHaveBeenCalled()
    expect(process.env.MISSI_EXISTING).toBe("existing")
    expect(process.env.MISSI_ADDED_FROM_ENV).toBe("incoming-added")
  })

  it("passes non-relay requests through to the OpenNext worker", async () => {
    const env = { MISSI_ADDED_FROM_ENV: "incoming-added" }
    const ctx = {
      waitUntil: vi.fn(),
      passThroughOnException: vi.fn(),
    }
    const request = new Request("https://missi.space/api/v1/live-token", {
      method: "POST",
    })

    const response = await workerEntry.fetch(request, env, ctx)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe("open-next")
    expect(openNextFetchMock).toHaveBeenCalledWith(request, env, ctx)
    expect(handleLiveWsMock).not.toHaveBeenCalled()
    expect(process.env.MISSI_ADDED_FROM_ENV).toBe("incoming-added")
  })
})
