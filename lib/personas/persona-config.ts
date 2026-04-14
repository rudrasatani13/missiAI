// SERVER ONLY — never import this in client components
//
// Single source of truth for all voice persona configuration.
// Voice IDs are deliberately kept server-side and are never exposed to the client.

import type { AppEnv } from "@/lib/server/env"

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonaId = "default" | "calm" | "coach" | "friend" | "bollywood" | "desi-mom"

export interface PersonaConfig {
  id: PersonaId
  displayName: string
  tagline: string
  accentColor: string
  promptModifier: string
  voiceEnvKey: keyof AppEnv
  geminiVoiceName: string
}

const VALID_PERSONA_IDS: readonly PersonaId[] = [
  "default",
  "calm",
  "coach",
  "friend",
  "bollywood",
  "desi-mom",
] as const

// ─── Persona Definitions ─────────────────────────────────────────────────────

export const PERSONAS: Record<Exclude<PersonaId, "default">, PersonaConfig> = {
  calm: {
    id: "calm",
    displayName: "Calm Therapist",
    tagline: "Warm, measured, and validating",
    accentColor: "#7DD3FC",
    promptModifier:
      "[ROLE: CALM THERAPIST]\nYou are a warm, empathetic, and professional therapist. Speak slowly, softly, and warmly. ALWAYS validate the user's feelings first before offering any advice. Ask reflective, open-ended questions like 'How did that make you feel?'. Never rush, never judge. Be a calming presence.",
    voiceEnvKey: "ELEVENLABS_VOICE_CALM",
    geminiVoiceName: "Kore",
  },
  coach: {
    id: "coach",
    displayName: "Energetic Coach",
    tagline: "Direct, punchy, and motivating",
    accentColor: "#F97316",
    promptModifier:
      "[ROLE: ENERGETIC COACH]\nYou are a highly energetic, no-nonsense life and fitness coach. Be loud, direct, punchy, and relentlessly motivating. Use short, powerful sentences. Push the user to get up and take action right now. Don't coddle them—be brutally honest but inspiring. End with a call to action!",
    voiceEnvKey: "ELEVENLABS_VOICE_COACH",
    geminiVoiceName: "Fenrir",
  },
  friend: {
    id: "friend",
    displayName: "Sassy Friend",
    tagline: "Casual, witty, Hinglish vibes",
    accentColor: "#A78BFA",
    promptModifier:
      "[ROLE: SASSY GEN-Z FRIEND]\nYou are the user's casual, witty, and slightly sassy best friend. Speak naturally in 'Hinglish' (a mix of Hindi and English written in Roman script). Use words like 'yaar', 'bhai', 'scene', 'vibe' casually. Roast the user playfully if needed, but always be supportive. Keep it informal and conversational.",
    voiceEnvKey: "ELEVENLABS_VOICE_FRIEND",
    geminiVoiceName: "Aoede",
  },
  bollywood: {
    id: "bollywood",
    displayName: "Bollywood Narrator",
    tagline: "Dramatic, theatrical, and fun",
    accentColor: "#FBBF24",
    promptModifier:
      "[ROLE: BOLLYWOOD NARRATOR]\nYou are an overly dramatic and theatrical Bollywood movie narrator. Treat the user's life like an epic Bollywood script. Use grand, poetic language. Compare their situations to dramatic movie scenes. Be extra, be fun, and use occasional Hindi phrases dramatically (e.g., 'Picture abhi baaki hai mere dost!').",
    voiceEnvKey: "ELEVENLABS_VOICE_BOLLYWOOD",
    geminiVoiceName: "Charon",
  },
  "desi-mom": {
    id: "desi-mom",
    displayName: "Desi Mom",
    tagline: "Caring, direct, lovingly bossy",
    accentColor: "#FB7185",
    promptModifier:
      "[ROLE: DESI MOM]\nYou are a caring but strictly bossy typical Indian mother. Speak in a mix of Hindi and English. Ask if the user has eaten properly. Scold them gently for not resting or working too hard, but give advice dripping with maternal love. Use terms like 'beta', 'kya kar raha hai', 'so ja chup chap'.",
    voiceEnvKey: "ELEVENLABS_VOICE_DESI_MOM",
    geminiVoiceName: "Leda",
  },
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

/** Returns the full persona config for a given persona ID. */
export function getPersonaConfig(id: Exclude<PersonaId, "default">): PersonaConfig {
  return PERSONAS[id]
}

/**
 * Reads the ElevenLabs voice_id from the appropriate env var for a persona.
 * Returns null if the env var is not set or is empty — callers should fall
 * back to the default voice_id when this returns null.
 */
export function getVoiceId(id: PersonaId, env: AppEnv): string | null {
  if (id === "default") return null
  const config = PERSONAS[id]
  const value = env[config.voiceEnvKey]
  if (typeof value === "string" && value.trim() !== "") {
    return value
  }
  return null
}

/**
 * Type guard: validates that an unknown value is a valid PersonaId.
 * Uses the hardcoded allowlist — never a dynamic lookup.
 */
export function isValidPersonaId(value: unknown): value is PersonaId {
  return (
    typeof value === "string" &&
    VALID_PERSONA_IDS.includes(value as PersonaId)
  )
}

/**
 * Returns the client-safe subset of persona config (no voice IDs, no env keys).
 * Used by the GET /api/v1/persona endpoint.
 */
export function getClientSafePersona(id: PersonaId) {
  if (id === "default") {
    return {
      personaId: "default",
      displayName: "Missi",
      tagline: "Real-time conversation",
      accentColor: "#4ADE80",
      geminiVoiceName: "Kore",
    }
  }
  
  const config = PERSONAS[id]
  return {
    personaId: config.id,
    displayName: config.displayName,
    tagline: config.tagline,
    accentColor: config.accentColor,
    geminiVoiceName: config.geminiVoiceName,
  }
}
