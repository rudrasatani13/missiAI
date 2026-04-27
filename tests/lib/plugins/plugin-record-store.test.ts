import { describe, it, expect } from "vitest"
import {
  PLUGIN_CONFIG_RECORD_IDS,
  buildPluginConfigIndexKey,
  buildPluginConfigRecordKey,
  buildPluginConfigRecordPrefix,
  deletePluginConfigRecord,
  getPluginConfigIndex,
  getPluginConfigRecord,
  listPluginConfigRecords,
  putPluginConfigIndex,
  putPluginConfigRecord,
  toPluginConfig,
} from "@/lib/plugins/plugin-record-store"
import type { KVStore } from "@/types"
import type { PluginConfig } from "@/types/plugins"

function makeKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => { store.set(key, value) },
    delete: async (key: string) => { store.delete(key) },
  }
}

function makeNotionConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    id: "notion",
    name: "Notion",
    status: "connected",
    credentials: { apiKey: "secret_test123" },
    settings: { defaultPageId: "page-abc" },
    connectedAt: 1700000000000,
    ...overrides,
  }
}

describe("plugin-record-store key builders", () => {
  it("builds the v2 config prefix", () => {
    expect(buildPluginConfigRecordPrefix("user-1")).toBe("plugins:v2:config:user-1:")
  })

  it("builds the v2 config key", () => {
    expect(buildPluginConfigRecordKey("user-1", "notion")).toBe("plugins:v2:config:user-1:notion")
  })

  it("builds the v2 config index key", () => {
    expect(buildPluginConfigIndexKey("user-1")).toBe("plugins:v2:index:user-1")
  })

  it("exports the supported plugin ids", () => {
    expect(PLUGIN_CONFIG_RECORD_IDS).toEqual(["notion", "google_calendar", "webhook"])
  })
})

describe("putPluginConfigRecord / getPluginConfigRecord", () => {
  it("round-trips a stored record", async () => {
    const kv = makeKV()
    const config = makeNotionConfig({ lastUsedAt: 1700000005000 })

    const stored = await putPluginConfigRecord(kv, "user-1", config, { updatedAt: 1700000010000 })
    const loaded = await getPluginConfigRecord(kv, "user-1", "notion")

    expect(stored).toEqual({
      userId: "user-1",
      id: "notion",
      name: "Notion",
      status: "connected",
      credentials: { apiKey: "secret_test123" },
      settings: { defaultPageId: "page-abc" },
      connectedAt: 1700000000000,
      lastUsedAt: 1700000005000,
      updatedAt: 1700000010000,
    })
    expect(loaded).toEqual(stored)
    await expect(getPluginConfigIndex(kv, "user-1")).resolves.toEqual({
      userId: "user-1",
      pluginIds: ["notion"],
      updatedAt: 1700000010000,
    })
  })

  it("returns null when the stored JSON is invalid", async () => {
    const kv = makeKV()
    await kv.put(buildPluginConfigRecordKey("user-1", "notion"), "not-json")

    await expect(getPluginConfigRecord(kv, "user-1", "notion")).resolves.toBeNull()
  })

  it("returns null when the stored userId does not match the requested user", async () => {
    const kv = makeKV()
    await kv.put(
      buildPluginConfigRecordKey("user-1", "notion"),
      JSON.stringify({
        userId: "user-2",
        id: "notion",
        name: "Notion",
        status: "connected",
        credentials: { apiKey: "secret" },
        settings: { defaultPageId: "page-abc" },
        connectedAt: 1700000000000,
        updatedAt: 1700000010000,
      }),
    )

    await expect(getPluginConfigRecord(kv, "user-1", "notion")).resolves.toBeNull()
  })

  it("returns null when the stored plugin id does not match the requested plugin", async () => {
    const kv = makeKV()
    await kv.put(
      buildPluginConfigRecordKey("user-1", "notion"),
      JSON.stringify({
        userId: "user-1",
        id: "webhook",
        name: "Custom Webhook",
        status: "connected",
        credentials: { url: "https://example.com" },
        settings: {},
        connectedAt: 1700000000000,
        updatedAt: 1700000010000,
      }),
    )

    await expect(getPluginConfigRecord(kv, "user-1", "notion")).resolves.toBeNull()
  })

  it("throws when trying to store an invalid config payload", async () => {
    const kv = makeKV()

    await expect(
      putPluginConfigRecord(
        kv,
        "user-1",
        {
          id: "notion",
          name: "",
          status: "connected",
          credentials: { apiKey: "secret_test123" },
          settings: {},
          connectedAt: 1700000000000,
        },
      ),
    ).rejects.toThrow("Invalid PluginConfig payload")
  })
})

describe("deletePluginConfigRecord", () => {
  it("deletes the targeted plugin record", async () => {
    const kv = makeKV()
    await putPluginConfigRecord(kv, "user-1", makeNotionConfig())

    await deletePluginConfigRecord(kv, "user-1", "notion")

    await expect(getPluginConfigRecord(kv, "user-1", "notion")).resolves.toBeNull()
    await expect(getPluginConfigIndex(kv, "user-1")).resolves.toEqual({
      userId: "user-1",
      pluginIds: [],
      updatedAt: expect.any(Number),
    })
  })
})

describe("listPluginConfigRecords", () => {
  it("returns the stored plugin records for the supported ids", async () => {
    const kv = makeKV()
    await putPluginConfigRecord(kv, "user-1", makeNotionConfig(), { updatedAt: 1700000010000 })
    await putPluginConfigRecord(
      kv,
      "user-1",
      {
        id: "webhook",
        name: "Custom Webhook",
        status: "connected",
        credentials: { url: "https://example.com/hook" },
        settings: { method: "POST" },
        connectedAt: 1700000001000,
      },
      { updatedAt: 1700000011000 },
    )

    const records = await listPluginConfigRecords(kv, "user-1")

    expect(records).toHaveLength(2)
    expect(records.map((record) => record.id)).toEqual(["notion", "webhook"])
  })

  it("ignores records for other users", async () => {
    const kv = makeKV()
    await putPluginConfigRecord(kv, "user-2", makeNotionConfig())

    await expect(listPluginConfigRecords(kv, "user-1")).resolves.toEqual([])
  })

  it("uses the index when present instead of scanning every plugin id", async () => {
    const kv = makeKV()
    await putPluginConfigRecord(kv, "user-1", makeNotionConfig())
    await putPluginConfigRecord(
      kv,
      "user-1",
      {
        id: "webhook",
        name: "Custom Webhook",
        status: "connected",
        credentials: { url: "https://example.com/hook" },
        settings: { method: "POST" },
        connectedAt: 1700000001000,
      },
      { updatedAt: 1700000011000 },
    )
    await putPluginConfigIndex(kv, "user-1", ["webhook"], 1700000020000)

    const records = await listPluginConfigRecords(kv, "user-1")

    expect(records.map((record) => record.id)).toEqual(["webhook"])
  })
})

describe("toPluginConfig", () => {
  it("returns the public PluginConfig shape without updatedAt", () => {
    const config = toPluginConfig({
      userId: "user-1",
      id: "notion",
      name: "Notion",
      status: "connected",
      credentials: { apiKey: "secret_test123" },
      settings: { defaultPageId: "page-abc" },
      connectedAt: 1700000000000,
      lastUsedAt: 1700000005000,
      updatedAt: 1700000010000,
    })

    expect(config).toEqual({
      id: "notion",
      name: "Notion",
      status: "connected",
      credentials: { apiKey: "secret_test123" },
      settings: { defaultPageId: "page-abc" },
      connectedAt: 1700000000000,
      lastUsedAt: 1700000005000,
    })
  })
})
