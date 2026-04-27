import { beforeEach, describe, expect, it, vi } from "vitest"
import type { KVStore, Message } from "@/types"
import {
  getCachedChatContext,
  setCachedChatContext,
  invalidateChatContext,
  isContextCacheable,
  isChatContextValid,
} from "@/lib/server/chat/context-cache"

function createMockKV(initialData: Record<string, string> = {}): KVStore {
  const store = { ...initialData }
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      store[key] = value
    }),
    delete: vi.fn(async (_key: string) => {}),
  }
}

const userId = "user-123"
const personality = "Missi"
const incognito = false
const messages: Message[] = [
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi there" },
]

const cachedData = {
  memories: "test memory",
  systemPrompt: "test system prompt",
  model: "gemini-2.5-pro",
  maxOutputTokens: 600,
  availableDeclarations: [{ name: "test" }],
}

describe("isContextCacheable", () => {
  it("returns true for normal text chat", () => {
    expect(isContextCacheable(false, false)).toBe(true)
    expect(isContextCacheable(undefined, undefined)).toBe(true)
  })

  it("returns false for voice mode", () => {
    expect(isContextCacheable(true, false)).toBe(false)
  })

  it("returns false for exam buddy mode", () => {
    expect(isContextCacheable(false, true)).toBe(false)
  })
})

describe("getCachedChatContext", () => {
  it("returns null when kv is null", async () => {
    const result = await getCachedChatContext(null, userId, personality, messages, incognito)
    expect(result).toBeNull()
  })

  it("returns null when no user message exists", async () => {
    const kv = createMockKV()
    const result = await getCachedChatContext(kv, userId, personality, [{ role: "assistant", content: "Hi" }], incognito)
    expect(result).toBeNull()
  })

  it("returns null when user message is too long (>120 chars)", async () => {
    const kv = createMockKV()
    const longMessage: Message = { role: "user", content: "a".repeat(121) }
    const result = await getCachedChatContext(kv, userId, personality, [longMessage], incognito)
    expect(result).toBeNull()
  })

  it("returns null on cache miss", async () => {
    const kv = createMockKV()
    const result = await getCachedChatContext(kv, userId, personality, messages, incognito)
    expect(result).toBeNull()
  })

  it("returns cached data on hit", async () => {
    const kv = createMockKV()
    await setCachedChatContext(kv, userId, personality, messages, incognito, cachedData)
    const result = await getCachedChatContext(kv, userId, personality, messages, incognito)
    expect(result).toMatchObject(cachedData)
  })

  it("returns null when cache is expired (>60s old)", async () => {
    const now = Date.now()
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(now)

    const kv = createMockKV()
    await setCachedChatContext(kv, userId, personality, messages, incognito, cachedData)

    // Advance time by 61 seconds so the entry is stale
    vi.setSystemTime(now + 61_000)

    const result = await getCachedChatContext(kv, userId, personality, messages, incognito)
    expect(result).toBeNull()

    vi.useRealTimers()
  })

  it("returns null when invalidated after write", async () => {
    const now = Date.now()
    vi.useFakeTimers({ shouldAdvanceTime: false })
    vi.setSystemTime(now)

    const kv = createMockKV()
    await setCachedChatContext(kv, userId, personality, messages, incognito, cachedData)

    // Advance time by 1 ms so invalidation is strictly newer
    vi.setSystemTime(now + 1)
    await invalidateChatContext(kv, userId)

    const result = await getCachedChatContext(kv, userId, personality, messages, incognito)
    expect(result).toBeNull()

    vi.useRealTimers()
  })
})

describe("setCachedChatContext", () => {
  it("does nothing when user message is too long", async () => {
    const kv = createMockKV()
    const longMessage: Message = { role: "user", content: "a".repeat(121) }
    await setCachedChatContext(kv, userId, personality, [longMessage], incognito, cachedData)
    expect(kv.put).not.toHaveBeenCalled()
  })

  it("stores data with 60s TTL", async () => {
    const kv = createMockKV()
    await setCachedChatContext(kv, userId, personality, messages, incognito, cachedData)
    expect(kv.put).toHaveBeenCalledTimes(1)
    const [, , opts] = (kv.put as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(opts).toMatchObject({ expirationTtl: 60 })
  })
})

describe("invalidateChatContext", () => {
  it("stores an invalidation token with 1h TTL", async () => {
    const kv = createMockKV()
    await invalidateChatContext(kv, userId)
    expect(kv.put).toHaveBeenCalledTimes(1)
    const [key, , opts] = (kv.put as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(key).toContain(":v:")
    expect(opts).toMatchObject({ expirationTtl: 3600 })
  })
})

describe("isChatContextValid", () => {
  it("returns true when no invalidation token exists", async () => {
    const kv = createMockKV()
    const result = await isChatContextValid(kv, userId, Date.now())
    expect(result).toBe(true)
  })

  it("returns false when invalidation token is newer than cachedAt", async () => {
    const kv = createMockKV()
    await invalidateChatContext(kv, userId)
    const result = await isChatContextValid(kv, userId, Date.now() - 1000)
    expect(result).toBe(false)
  })

  it("returns true when invalidation token is older than cachedAt", async () => {
    const kv = createMockKV()
    await invalidateChatContext(kv, userId)
    // cachedAt after invalidation
    await new Promise((r) => setTimeout(r, 10))
    const result = await isChatContextValid(kv, userId, Date.now())
    expect(result).toBe(true)
  })
})
