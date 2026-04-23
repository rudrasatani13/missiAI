import { beforeEach, describe, expect, it } from "vitest"
import type { KVStore } from "@/types"
import {
  getGoogleTokens,
  getNotionTokens,
  googleTokenKey,
  notionTokenKey,
  saveGoogleTokens,
  saveNotionTokens,
  type GoogleTokens,
  type NotionTokens,
} from "@/lib/plugins/data-fetcher"
import { decryptFromKV } from "@/lib/server/kv-crypto"

function createMockKV() {
  const store = new Map<string, string>()
  const kv: KVStore = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  }

  return { kv, store }
}

describe("plugin data fetcher token storage", () => {
  let kv: KVStore
  let store: Map<string, string>

  beforeEach(() => {
    const mock = createMockKV()
    kv = mock.kv
    store = mock.store
  })

  it("encrypts Google OAuth tokens at rest", async () => {
    const tokens: GoogleTokens = {
      accessToken: "google-access",
      refreshToken: "google-refresh",
      expiresAt: 1234567890,
    }

    await saveGoogleTokens(kv, "user_1", tokens)

    const raw = store.get(googleTokenKey("user_1"))
    expect(raw).toBeTruthy()
    expect(raw).toMatch(/^enc:v1:/)
    await expect(decryptFromKV(raw!)).resolves.toBe(JSON.stringify(tokens))
    await expect(getGoogleTokens(kv, "user_1")).resolves.toEqual(tokens)
  })

  it("migrates legacy plaintext Google OAuth tokens on read", async () => {
    const tokens: GoogleTokens = {
      accessToken: "legacy-google-access",
      refreshToken: "legacy-google-refresh",
      expiresAt: 2222222222,
    }

    store.set(googleTokenKey("user_2"), JSON.stringify(tokens))

    await expect(getGoogleTokens(kv, "user_2")).resolves.toEqual(tokens)

    const migrated = store.get(googleTokenKey("user_2"))
    expect(migrated).toBeTruthy()
    expect(migrated).toMatch(/^enc:v1:/)
    await expect(decryptFromKV(migrated!)).resolves.toBe(JSON.stringify(tokens))
  })

  it("encrypts and migrates Notion OAuth tokens", async () => {
    const tokens: NotionTokens = {
      accessToken: "notion-access",
      workspaceName: "Workspace",
      botId: "bot_123",
    }

    await saveNotionTokens(kv, "user_3", tokens)
    const encrypted = store.get(notionTokenKey("user_3"))
    expect(encrypted).toBeTruthy()
    expect(encrypted).toMatch(/^enc:v1:/)
    await expect(getNotionTokens(kv, "user_3")).resolves.toEqual(tokens)

    store.set(notionTokenKey("user_4"), JSON.stringify(tokens))
    await expect(getNotionTokens(kv, "user_4")).resolves.toEqual(tokens)
    const migrated = store.get(notionTokenKey("user_4"))
    expect(migrated).toBeTruthy()
    expect(migrated).toMatch(/^enc:v1:/)
  })
})
