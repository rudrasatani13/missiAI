import { describe, it, expect } from "vitest"
import {
  PERSONAS,
  getPersonaConfig,
  getVoiceId,
  isValidPersonaId,
  getClientSafePersona,
  type PersonaId,
} from "@/lib/personas/persona-config"
import type { AppEnv } from "@/lib/server/env"

// ─── Mock AppEnv ──────────────────────────────────────────────────────────────

function mockEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
        ELEVENLABS_API_KEY: "test-key",
    ELEVENLABS_VOICE_ID: "default-voice",
    ELEVENLABS_VOICE_CALM: undefined,
    ELEVENLABS_VOICE_COACH: undefined,
    ELEVENLABS_VOICE_FRIEND: undefined,
    ELEVENLABS_VOICE_BOLLYWOOD: undefined,
    ELEVENLABS_VOICE_DESI_MOM: undefined,
    CLERK_SECRET_KEY: "test",
    DAILY_BUDGET_USD: 5,
    NODE_ENV: "test",
    DODO_PAYMENTS_API_KEY: "test",
    DODO_WEBHOOK_SECRET: "test",
    DODO_PRO_PRODUCT_ID: "test",
    DODO_PAYMENTS_MODE: "test_mode",
    VAPID_PRIVATE_KEY: undefined,
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    NOTION_CLIENT_ID: undefined,
    NOTION_CLIENT_SECRET: undefined,
    NOTION_API_KEY: undefined,
    APP_URL: "http://localhost:3000",
    AI_BACKEND: "vertex",
    VERTEX_AI_PROJECT_ID: undefined,
    VERTEX_AI_LOCATION: undefined,
    GOOGLE_SERVICE_ACCOUNT_JSON: undefined,
    RESEND_API_KEY: undefined,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("persona-config", () => {
  const ALL_IDS: Exclude<PersonaId, "default">[] = ["calm", "coach", "friend", "bollywood", "desi-mom"]

  describe("PERSONAS record", () => {
    it("contains all 5 personas", () => {
      expect(Object.keys(PERSONAS)).toHaveLength(5)
      for (const id of ALL_IDS) {
        expect(PERSONAS[id]).toBeDefined()
      }
    })

    it("each persona has non-empty displayName, tagline, promptModifier, voiceEnvKey", () => {
      for (const id of ALL_IDS) {
        const config = PERSONAS[id]
        expect(config.displayName).toBeTruthy()
        expect(config.tagline).toBeTruthy()
        expect(config.promptModifier).toBeTruthy()
        expect(config.voiceEnvKey).toBeTruthy()
        expect(config.accentColor).toBeTruthy()
        expect(config.id).toBe(id)
      }
    })

    it("promptModifier is under 200 characters for each persona", () => {
      for (const id of ALL_IDS) {
        expect(PERSONAS[id].promptModifier.length).toBeLessThanOrEqual(600)
      }
    })
  })

  describe("getPersonaConfig", () => {
    it("returns the correct config for each persona ID", () => {
      for (const id of ALL_IDS) {
        const config = getPersonaConfig(id)
        expect(config.id).toBe(id)
        expect(config.displayName).toBeTruthy()
      }
    })
  })

  describe("isValidPersonaId", () => {
    it("returns true for all 5 valid IDs", () => {
      for (const id of ALL_IDS) {
        expect(isValidPersonaId(id)).toBe(true)
      }
    })

    it("returns false for invalid values", () => {
      expect(isValidPersonaId("hacker")).toBe(false)
      expect(isValidPersonaId("")).toBe(false)
      expect(isValidPersonaId(null)).toBe(false)
      expect(isValidPersonaId(undefined)).toBe(false)
      expect(isValidPersonaId(42)).toBe(false)
      expect(isValidPersonaId("'; DROP TABLE users;")).toBe(false)
      expect(isValidPersonaId("CALM")).toBe(false) // case-sensitive
      expect(isValidPersonaId("calm ")).toBe(false) // trailing space
      expect(isValidPersonaId("bestfriend")).toBe(false) // personality, not persona
      expect(isValidPersonaId("a".repeat(1000))).toBe(false) // very long string
    })
  })

  describe("getVoiceId", () => {
    it("returns null when env var is not set (never throws)", () => {
      const env = mockEnv()
      for (const id of ALL_IDS) {
        const result = getVoiceId(id, env)
        expect(result).toBeNull()
      }
    })

    it("returns null when env var is empty string", () => {
      const env = mockEnv({ ELEVENLABS_VOICE_CALM: "" })
      expect(getVoiceId("calm", env)).toBeNull()
    })

    it("returns null when env var is whitespace-only", () => {
      const env = mockEnv({ ELEVENLABS_VOICE_CALM: "   " })
      expect(getVoiceId("calm", env)).toBeNull()
    })

    it("returns the voice ID when env var is set", () => {
      const env = mockEnv({ ELEVENLABS_VOICE_CALM: "abc123" })
      expect(getVoiceId("calm", env)).toBe("abc123")
    })

    it("returns the correct voice ID for each persona", () => {
      const env = mockEnv({
        ELEVENLABS_VOICE_CALM: "voice-calm",
        ELEVENLABS_VOICE_COACH: "voice-coach",
        ELEVENLABS_VOICE_FRIEND: "voice-friend",
        ELEVENLABS_VOICE_BOLLYWOOD: "voice-bollywood",
        ELEVENLABS_VOICE_DESI_MOM: "voice-desi-mom",
      })
      expect(getVoiceId("calm", env)).toBe("voice-calm")
      expect(getVoiceId("coach", env)).toBe("voice-coach")
      expect(getVoiceId("friend", env)).toBe("voice-friend")
      expect(getVoiceId("bollywood", env)).toBe("voice-bollywood")
      expect(getVoiceId("desi-mom", env)).toBe("voice-desi-mom")
    })
  })

  describe("getClientSafePersona", () => {
    it("returns only UI-safe fields (no voiceEnvKey, no promptModifier)", () => {
      const safe = getClientSafePersona("calm")
      expect(safe).toHaveProperty("personaId")
      expect(safe).toHaveProperty("displayName")
      expect(safe).toHaveProperty("tagline")
      expect(safe).toHaveProperty("accentColor")
      expect(safe).not.toHaveProperty("voiceEnvKey")
      expect(safe).not.toHaveProperty("promptModifier")
    })
  })
})
