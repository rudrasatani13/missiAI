import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  getUserPersona,
  saveUserPersona,
  getPersonaRateLimit,
  incrementPersonaRateLimit,
  isPersonaRateLimited,
  InvalidPersonaError,
} from "@/lib/personas/persona-store"
import type { KVStore } from "@/types"

// ─── Mock KV ──────────────────────────────────────────────────────────────────

function createMockKV(): KVStore & { store: Map<string, string> } {
  const store = new Map<string, string>()
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value) }),
    delete: vi.fn(async (key: string) => { store.delete(key) }),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("persona-store", () => {
  let kv: ReturnType<typeof createMockKV>

  beforeEach(() => {
    kv = createMockKV()
    vi.restoreAllMocks()
  })

  describe("getUserPersona", () => {
    it("returns 'default' when KV is empty (no preference stored)", async () => {
      const result = await getUserPersona(kv, "user-123")
      expect(result).toBe("default")
      expect(kv.get).toHaveBeenCalledWith("persona:preference:user-123")
    })

    it("returns the correct stored value", async () => {
      kv.store.set("persona:preference:user-456", "coach")
      const result = await getUserPersona(kv, "user-456")
      expect(result).toBe("coach")
    })

    it("returns stored value for all 5 valid persona IDs", async () => {
      const ids = ["calm", "coach", "friend", "bollywood", "desi-mom"] as const
      for (const id of ids) {
        kv.store.set(`persona:preference:user-${id}`, id)
        const result = await getUserPersona(kv, `user-${id}`)
        expect(result).toBe(id)
      }
    })

    it("returns 'default' and logs warning if stored value is corrupted", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      kv.store.set("persona:preference:user-corrupted", "INVALID_VALUE")

      const result = await getUserPersona(kv, "user-corrupted")
      expect(result).toBe("default")
      expect(warnSpy).toHaveBeenCalledOnce()
      expect(warnSpy.mock.calls[0][0]).toContain("Invalid persona value")

      warnSpy.mockRestore()
    })

    it("returns 'default' when stored value is an empty string", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
      kv.store.set("persona:preference:user-empty", "")

      const result = await getUserPersona(kv, "user-empty")
      expect(result).toBe("default")

      warnSpy.mockRestore()
    })
  })

  describe("saveUserPersona", () => {
    it("saves a valid persona ID to KV", async () => {
      await saveUserPersona(kv, "user-789", "friend")
      expect(kv.put).toHaveBeenCalledWith("persona:preference:user-789", "friend")
      expect(kv.store.get("persona:preference:user-789")).toBe("friend")
    })

    it("writes correctly for all 5 valid persona IDs", async () => {
      const ids = ["calm", "coach", "friend", "bollywood", "desi-mom"] as const
      for (const id of ids) {
        await saveUserPersona(kv, `user-${id}`, id)
        expect(kv.store.get(`persona:preference:user-${id}`)).toBe(id)
      }
    })

    it("throws InvalidPersonaError when called with invalid personaId", async () => {
      await expect(
        saveUserPersona(kv, "user-bad", "hacker" as any),
      ).rejects.toThrow(InvalidPersonaError)
    })

    it("does NOT write to KV when personaId is invalid", async () => {
      try {
        await saveUserPersona(kv, "user-bad", "nope" as any)
      } catch { /* expected */ }
      expect(kv.store.has("persona:preference:user-bad")).toBe(false)
    })
  })

  describe("rate limiting", () => {
    it("getPersonaRateLimit returns 0 when key not found", async () => {
      const count = await getPersonaRateLimit(kv, "user-new")
      expect(count).toBe(0)
    })

    it("incrementPersonaRateLimit increments correctly", async () => {
      await incrementPersonaRateLimit(kv, "user-rate")
      const count1 = await getPersonaRateLimit(kv, "user-rate")
      expect(count1).toBe(1)

      await incrementPersonaRateLimit(kv, "user-rate")
      const count2 = await getPersonaRateLimit(kv, "user-rate")
      expect(count2).toBe(2)
    })

    it("isPersonaRateLimited returns false below limit", () => {
      expect(isPersonaRateLimited(0)).toBe(false)
      expect(isPersonaRateLimited(9)).toBe(false)
    })

    it("isPersonaRateLimited returns true at and above limit", () => {
      expect(isPersonaRateLimited(10)).toBe(true)
      expect(isPersonaRateLimited(11)).toBe(true)
      expect(isPersonaRateLimited(100)).toBe(true)
    })

    it("rate limit counter persists across reads", async () => {
      // Simulate 10 increments
      for (let i = 0; i < 10; i++) {
        await incrementPersonaRateLimit(kv, "user-limit")
      }
      const count = await getPersonaRateLimit(kv, "user-limit")
      expect(count).toBe(10)
      expect(isPersonaRateLimited(count)).toBe(true)
    })
  })
})
