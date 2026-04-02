import { describe, it, expect, beforeEach } from "vitest"
import {
  getUserPlugins,
  saveUserPlugins,
  getConnectedPlugin,
  upsertPlugin,
  disconnectPlugin,
  stripCredentials,
} from "@/lib/plugins/plugin-store"
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

  it("returns parsed plugins when KV has an entry", async () => {
    const kv = makeKV()
    const config = makeNotionConfig()
    await kv.put("plugins:config:user-1", JSON.stringify({ userId: "user-1", plugins: [config], updatedAt: Date.now() }))
    const result = await getUserPlugins(kv, "user-1")
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0].id).toBe("notion")
  })

  it("returns empty plugins on corrupt JSON", async () => {
    const kv = makeKV()
    await kv.put("plugins:config:user-bad", "not-json")
    const result = await getUserPlugins(kv, "user-bad")
    expect(result.plugins).toEqual([])
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
