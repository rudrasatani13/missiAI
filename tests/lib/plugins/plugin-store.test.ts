import { describe, it, expect } from "vitest"
import {
  getUserPlugins,
  getConnectedPlugin,
  upsertPlugin,
  disconnectPlugin,
  stripCredentials,
} from "@/lib/plugins/plugin-store"
import {
  getPluginConfigIndex,
  getPluginConfigRecord,
  putPluginConfigIndex,
  putPluginConfigRecord,
} from "@/lib/plugins/plugin-record-store"
import type { KVStore } from "@/types"
import type { PluginConfig } from "@/types/plugins"

// ─── In-memory KV for testing ────────────────────────────────────────────────

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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("getUserPlugins", () => {
  it("returns empty plugins array when KV has no entry", async () => {
    const kv = makeKV()
    const result = await getUserPlugins(kv, "user-1")
    expect(result.plugins).toEqual([])
    expect(result.userId).toBe("user-1")
  })

  it("loads and backfills plugins when only the legacy blob exists", async () => {
    const kv = makeKV()
    const config = makeNotionConfig()
    await kv.put("plugins:config:user-1", JSON.stringify({ userId: "user-1", plugins: [config], updatedAt: 1700000010000 }))

    const result = await getUserPlugins(kv, "user-1")

    expect(result.plugins).toEqual([config])
    expect(result.updatedAt).toBe(1700000010000)
    await expect(getPluginConfigRecord(kv, "user-1", "notion")).resolves.toMatchObject({
      id: "notion",
      settings: { defaultPageId: "page-abc" },
      updatedAt: 1700000010000,
    })
    await expect(getPluginConfigIndex(kv, "user-1")).resolves.toEqual({
      userId: "user-1",
      pluginIds: ["notion"],
      updatedAt: 1700000010000,
    })
  })

  it("returns empty plugins when the legacy blob is corrupt", async () => {
    const kv = makeKV()
    await kv.put("plugins:config:user-bad", "not-json")
    const result = await getUserPlugins(kv, "user-bad")
    expect(result.plugins).toEqual([])
  })

  it("does not resurrect legacy plugins after an empty v2 index exists", async () => {
    const kv = makeKV()
    await kv.put("plugins:config:user-1", JSON.stringify({
      userId: "user-1",
      plugins: [makeNotionConfig()],
      updatedAt: 1700000010000,
    }))
    await putPluginConfigIndex(kv, "user-1", [], 1700000020000)

    const result = await getUserPlugins(kv, "user-1")

    expect(result.plugins).toEqual([])
    await expect(getConnectedPlugin(kv, "user-1", "notion")).resolves.toBeNull()
  })

  it("returns v2 plugin records when present", async () => {
    const kv = makeKV()
    await putPluginConfigRecord(
      kv,
      "user-1",
      makeNotionConfig({ settings: { defaultPageId: "page-v2" } }),
      { updatedAt: 1700000010000 },
    )

    const result = await getUserPlugins(kv, "user-1")

    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0].settings.defaultPageId).toBe("page-v2")
    expect(result.updatedAt).toBe(1700000010000)
  })
})

describe("upsertPlugin", () => {
  it("adds a new plugin when none exist", async () => {
    const kv = makeKV()
    const config = makeNotionConfig()
    await upsertPlugin(kv, "user-1", config)
    const { plugins } = await getUserPlugins(kv, "user-1")
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe("notion")
  })

  it("updates an existing plugin with the same id", async () => {
    const kv = makeKV()
    const original = makeNotionConfig()
    await upsertPlugin(kv, "user-1", original)

    const updated = makeNotionConfig({ settings: { defaultPageId: "page-xyz" } })
    await upsertPlugin(kv, "user-1", updated)

    const { plugins } = await getUserPlugins(kv, "user-1")
    expect(plugins).toHaveLength(1)
    expect(plugins[0].settings.defaultPageId).toBe("page-xyz")
  })

  it("keeps other plugins when adding a new one", async () => {
    const kv = makeKV()
    await upsertPlugin(kv, "user-1", makeNotionConfig())
    const webhook: PluginConfig = {
      id: "webhook",
      name: "Custom Webhook",
      status: "connected",
      credentials: { url: "https://example.com/hook" },
      settings: {},
      connectedAt: Date.now(),
    }
    await upsertPlugin(kv, "user-1", webhook)

    const { plugins } = await getUserPlugins(kv, "user-1")
    expect(plugins).toHaveLength(2)
  })

  it("writes the target plugin record directly", async () => {
    const kv = makeKV()

    await upsertPlugin(kv, "user-1", makeNotionConfig({ settings: { defaultPageId: "page-direct" } }))

    const stored = await getPluginConfigRecord(kv, "user-1", "notion")
    expect(stored?.settings.defaultPageId).toBe("page-direct")
    await expect(kv.get("plugins:config:user-1")).resolves.toBeNull()
  })

  it("backfills legacy plugins before adding a new plugin", async () => {
    const kv = makeKV()
    await kv.put("plugins:config:user-1", JSON.stringify({
      userId: "user-1",
      plugins: [makeNotionConfig()],
      updatedAt: 1700000010000,
    }))

    await upsertPlugin(kv, "user-1", {
      id: "webhook",
      name: "Custom Webhook",
      status: "connected",
      credentials: { url: "https://example.com/hook" },
      settings: {},
      connectedAt: 1700000001000,
    })

    const { plugins } = await getUserPlugins(kv, "user-1")
    expect(plugins.map((plugin) => plugin.id)).toEqual(["notion", "webhook"])
  })
})

describe("getConnectedPlugin", () => {
  it("returns null when no plugins exist", async () => {
    const kv = makeKV()
    const result = await getConnectedPlugin(kv, "user-1", "notion")
    expect(result).toBeNull()
  })

  it("returns the plugin when connected", async () => {
    const kv = makeKV()
    await upsertPlugin(kv, "user-1", makeNotionConfig())
    const result = await getConnectedPlugin(kv, "user-1", "notion")
    expect(result).not.toBeNull()
    expect(result?.id).toBe("notion")
  })

  it("returns and backfills a connected legacy plugin", async () => {
    const kv = makeKV()
    await kv.put("plugins:config:user-1", JSON.stringify({
      userId: "user-1",
      plugins: [makeNotionConfig()],
      updatedAt: 1700000010000,
    }))

    const result = await getConnectedPlugin(kv, "user-1", "notion")

    expect(result?.id).toBe("notion")
    await expect(getPluginConfigRecord(kv, "user-1", "notion")).resolves.toMatchObject({
      id: "notion",
      updatedAt: 1700000010000,
    })
  })

  it("returns null for a disconnected plugin", async () => {
    const kv = makeKV()
    await upsertPlugin(kv, "user-1", makeNotionConfig({ status: "disconnected" }))
    const result = await getConnectedPlugin(kv, "user-1", "notion")
    expect(result).toBeNull()
  })

  it("returns null when looking for a different plugin id", async () => {
    const kv = makeKV()
    await upsertPlugin(kv, "user-1", makeNotionConfig())
    const result = await getConnectedPlugin(kv, "user-1", "webhook")
    expect(result).toBeNull()
  })
})

describe("disconnectPlugin", () => {
  it("sets status to disconnected and clears credentials", async () => {
    const kv = makeKV()
    await upsertPlugin(kv, "user-1", makeNotionConfig())

    await disconnectPlugin(kv, "user-1", "notion")

    const { plugins } = await getUserPlugins(kv, "user-1")
    expect(plugins[0].status).toBe("disconnected")
    expect(plugins[0].credentials).toEqual({})
  })

  it("does nothing when plugin does not exist", async () => {
    const kv = makeKV()
    // Should not throw
    await expect(disconnectPlugin(kv, "user-1", "notion")).resolves.toBeUndefined()
  })

  it("only disconnects the targeted plugin", async () => {
    const kv = makeKV()
    await upsertPlugin(kv, "user-1", makeNotionConfig())
    const webhook: PluginConfig = {
      id: "webhook",
      name: "Custom Webhook",
      status: "connected",
      credentials: { url: "https://example.com" },
      settings: {},
      connectedAt: Date.now(),
    }
    await upsertPlugin(kv, "user-1", webhook)

    await disconnectPlugin(kv, "user-1", "notion")

    const { plugins } = await getUserPlugins(kv, "user-1")
    const webhookPlugin = plugins.find((p) => p.id === "webhook")
    expect(webhookPlugin?.status).toBe("connected")
  })

  it("updates only the target plugin record", async () => {
    const kv = makeKV()
    await upsertPlugin(kv, "user-1", makeNotionConfig())
    await upsertPlugin(kv, "user-1", {
      id: "webhook",
      name: "Custom Webhook",
      status: "connected",
      credentials: { url: "https://example.com/direct" },
      settings: {},
      connectedAt: 1700000002000,
    })

    const beforeWebhook = await getPluginConfigRecord(kv, "user-1", "webhook")
    await disconnectPlugin(kv, "user-1", "notion")
    const afterWebhook = await getPluginConfigRecord(kv, "user-1", "webhook")
    const notion = await getPluginConfigRecord(kv, "user-1", "notion")

    expect(notion?.status).toBe("disconnected")
    expect(notion?.credentials).toEqual({})
    expect(afterWebhook).toEqual(beforeWebhook)
  })

  it("backfills legacy plugins before disconnecting the target plugin", async () => {
    const kv = makeKV()
    await kv.put("plugins:config:user-1", JSON.stringify({
      userId: "user-1",
      plugins: [makeNotionConfig()],
      updatedAt: 1700000010000,
    }))

    await disconnectPlugin(kv, "user-1", "notion")

    const notion = await getPluginConfigRecord(kv, "user-1", "notion")
    expect(notion?.status).toBe("disconnected")
    expect(notion?.credentials).toEqual({})
  })
})

describe("stripCredentials", () => {
  it("removes the credentials field from plugin config", () => {
    const config = makeNotionConfig()
    const safe = stripCredentials(config)
    expect((safe as any).credentials).toBeUndefined()
  })

  it("preserves other fields", () => {
    const config = makeNotionConfig()
    const safe = stripCredentials(config)
    expect(safe.id).toBe("notion")
    expect(safe.name).toBe("Notion")
    expect(safe.status).toBe("connected")
    expect(safe.settings).toEqual({ defaultPageId: "page-abc" })
  })
})
