import { beforeEach, describe, expect, it, vi } from "vitest"
import type { VectorizeIndex } from "@cloudflare/workers-types"
import type { KVStore } from "@/types"

const {
  getCloudflareContextMock,
  searchLifeGraphMock,
  formatLifeGraphForPromptMock,
} = vi.hoisted(() => ({
  getCloudflareContextMock: vi.fn(),
  searchLifeGraphMock: vi.fn(),
  formatLifeGraphForPromptMock: vi.fn(),
}))

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: getCloudflareContextMock,
}))

vi.mock("@/lib/memory/life-graph", () => ({
  searchLifeGraph: searchLifeGraphMock,
  formatLifeGraphForPrompt: formatLifeGraphForPromptMock,
  MEMORY_TIMEOUT_MS: 5000,
}))

import { getChatKV, getChatVectorizeEnv, getLastUserMessageContent, loadLifeGraphMemoryContext } from "@/lib/server/chat/shared"

function createMockKV(): KVStore {
  return {
    get: vi.fn(async () => null),
    put: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
  }
}

describe("chat-shared", () => {
  let kv: KVStore
  let lifeGraph: VectorizeIndex

  beforeEach(() => {
    vi.clearAllMocks()
    kv = createMockKV()
    lifeGraph = {
      query: vi.fn(async () => ({ matches: [], count: 0 })) as unknown as VectorizeIndex["query"],
      upsert: vi.fn(async () => ({ count: 0, ids: [] })) as unknown as VectorizeIndex["upsert"],
      deleteByIds: vi.fn(async () => ({ count: 0, ids: [] })) as unknown as VectorizeIndex["deleteByIds"],
      describe: vi.fn(),
      insert: vi.fn(),
      getByIds: vi.fn(),
    } as unknown as VectorizeIndex
    getCloudflareContextMock.mockReturnValue({
      env: {
        MISSI_MEMORY: kv,
        LIFE_GRAPH: lifeGraph,
      },
    } as any)
    searchLifeGraphMock.mockResolvedValue([{ id: "node-1" }])
    formatLifeGraphForPromptMock.mockReturnValue("formatted-memory")
  })

  it("reads chat KV and Vectorize bindings from Cloudflare context", () => {
    expect(getChatKV()).toBe(kv)
    expect(getChatVectorizeEnv()).toEqual({ LIFE_GRAPH: lifeGraph })
  })

  it("returns the most recent user message content", () => {
    expect(getLastUserMessageContent([
      { role: "assistant", content: "hello" },
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "latest" },
    ])).toBe("latest")
    expect(getLastUserMessageContent([{ role: "assistant", content: "no user yet" }])).toBe("")
  })

  it("loads formatted Life Graph memories using the latest user message", async () => {
    const result = await loadLifeGraphMemoryContext({
      kv,
      vectorizeEnv: { LIFE_GRAPH: lifeGraph },
      userId: "user_1",
      messages: [
        { role: "assistant", content: "hello" },
        { role: "user", content: "earlier question" },
        { role: "assistant", content: "reply" },
        { role: "user", content: "latest question" },
      ],
    })

    expect(searchLifeGraphMock).toHaveBeenCalledWith(
      kv,
      { LIFE_GRAPH: lifeGraph },
      "user_1",
      "latest question",
      { topK: 5 },
    )
    expect(formatLifeGraphForPromptMock).toHaveBeenCalledWith([{ id: "node-1" }])
    expect(result).toBe("formatted-memory")
  })

  it("returns empty and invokes onError when memory lookup fails", async () => {
    const onError = vi.fn()
    const failure = new Error("memory unavailable")
    searchLifeGraphMock.mockRejectedValueOnce(failure)

    const result = await loadLifeGraphMemoryContext({
      kv,
      vectorizeEnv: { LIFE_GRAPH: lifeGraph },
      userId: "user_2",
      messages: [{ role: "user", content: "question" }],
      onError,
    })

    expect(result).toBe("")
    expect(onError).toHaveBeenCalledWith(failure)
  })

  it("returns empty without searching when skipped or storage is unavailable", async () => {
    const skipped = await loadLifeGraphMemoryContext({
      kv,
      vectorizeEnv: { LIFE_GRAPH: lifeGraph },
      userId: "user_3",
      messages: [{ role: "user", content: "question" }],
      skip: true,
    })
    const noStorage = await loadLifeGraphMemoryContext({
      kv: null,
      vectorizeEnv: { LIFE_GRAPH: lifeGraph },
      userId: "user_4",
      messages: [{ role: "user", content: "question" }],
    })

    expect(skipped).toBe("")
    expect(noStorage).toBe("")
    expect(searchLifeGraphMock).not.toHaveBeenCalled()
  })
})
