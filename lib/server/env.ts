// Server-only utilities for environment variables

// ─── Typed Environment Variables ──────────────────────────────────────────────
//
// Single source of truth for required env vars. Throws a clear error with the
// missing key name so deployment issues surface immediately.
//
// PRODUCTION: Set all secrets via `wrangler secret put <NAME>` or the
// Cloudflare Pages dashboard (Settings → Environment variables → Encrypted).
// See SECURITY.md for the full list and rotation procedure.

export interface AppEnv {
  /** @deprecated All AI traffic now routes through Vertex AI. Kept for backward compat. */
  GEMINI_API_KEY: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_VOICE_ID: string | undefined
  /** ElevenLabs voice ID for Calm Therapist persona — set via wrangler secret or dashboard */
  ELEVENLABS_VOICE_CALM: string | undefined
  /** ElevenLabs voice ID for Energetic Coach persona */
  ELEVENLABS_VOICE_COACH: string | undefined
  /** ElevenLabs voice ID for Sassy Friend persona */
  ELEVENLABS_VOICE_FRIEND: string | undefined
  /** ElevenLabs voice ID for Bollywood Narrator persona */
  ELEVENLABS_VOICE_BOLLYWOOD: string | undefined
  /** ElevenLabs voice ID for Desi Mom persona */
  ELEVENLABS_VOICE_DESI_MOM: string | undefined
  CLERK_SECRET_KEY: string
  DAILY_BUDGET_USD: number
  NODE_ENV: string
  DODO_PAYMENTS_API_KEY: string
  DODO_WEBHOOK_SECRET: string
  DODO_PRO_PRODUCT_ID: string

  DODO_PAYMENTS_MODE: string
  /** Web Push VAPID private key — required for sending push notifications. */
  VAPID_PRIVATE_KEY: string | undefined
  /** Google OAuth credentials for Calendar integration */
  GOOGLE_CLIENT_ID: string | undefined
  GOOGLE_CLIENT_SECRET: string | undefined
  /** Notion OAuth credentials for Notion integration */
  NOTION_CLIENT_ID: string | undefined
  NOTION_CLIENT_SECRET: string | undefined
  /** Notion Internal Integration API key (alternative to OAuth) */
  NOTION_API_KEY: string | undefined
  /** App URL for OAuth callbacks */
  APP_URL: string
  /** AI backend: 'vertex' for Vertex AI (free credits), 'google-ai' for Google AI Studio */
  AI_BACKEND: 'vertex' | 'google-ai'
  /** GCP Project ID for Vertex AI */
  VERTEX_AI_PROJECT_ID: string | undefined
  /** GCP region for Vertex AI (e.g. 'us-central1') */
  VERTEX_AI_LOCATION: string | undefined
  /** Service Account JSON (inline) for Vertex AI edge-compatible auth */
  GOOGLE_SERVICE_ACCOUNT_JSON: string | undefined
  /** Resend API key for sending emails via the sendEmail agent tool */
  RESEND_API_KEY: string | undefined
}

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

/**
 * Returns a typed env object with all required keys validated.
 *
 * Call at the top of each API route to fail fast on misconfiguration.
 */
export function getEnv(): AppEnv {
  return {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
    ELEVENLABS_API_KEY: requireEnv("ELEVENLABS_API_KEY"),
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || undefined,
    // Voice Persona IDs — must be filled with real ElevenLabs voice IDs before the feature is active
    ELEVENLABS_VOICE_CALM: process.env.ELEVENLABS_VOICE_CALM || undefined,
    ELEVENLABS_VOICE_COACH: process.env.ELEVENLABS_VOICE_COACH || undefined,
    ELEVENLABS_VOICE_FRIEND: process.env.ELEVENLABS_VOICE_FRIEND || undefined,
    ELEVENLABS_VOICE_BOLLYWOOD: process.env.ELEVENLABS_VOICE_BOLLYWOOD || undefined,
    ELEVENLABS_VOICE_DESI_MOM: process.env.ELEVENLABS_VOICE_DESI_MOM || undefined,
    CLERK_SECRET_KEY: requireEnv("CLERK_SECRET_KEY"),
    DAILY_BUDGET_USD: parseFloat(process.env.DAILY_BUDGET_USD ?? "5.0") || 5.0,
    NODE_ENV: process.env.NODE_ENV ?? "production",
    DODO_PAYMENTS_API_KEY: requireEnv("DODO_PAYMENTS_API_KEY"),
    DODO_WEBHOOK_SECRET: requireEnv("DODO_WEBHOOK_SECRET"),
    DODO_PRO_PRODUCT_ID: requireEnv("DODO_PRO_PRODUCT_ID"),

    DODO_PAYMENTS_MODE: process.env.DODO_PAYMENTS_MODE ?? "live_mode",
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || undefined,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || undefined,
    NOTION_CLIENT_ID: process.env.NOTION_CLIENT_ID || undefined,
    NOTION_CLIENT_SECRET: process.env.NOTION_CLIENT_SECRET || undefined,
    NOTION_API_KEY: process.env.NOTION_API_KEY || undefined,
    APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "http://localhost:3000",
    AI_BACKEND: (process.env.AI_BACKEND as 'vertex' | 'google-ai') || 'vertex',
    VERTEX_AI_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID || undefined,
    VERTEX_AI_LOCATION: process.env.VERTEX_AI_LOCATION || undefined,
    GOOGLE_SERVICE_ACCOUNT_JSON: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
  }
}

/**
 * Check if a specific env var exists without exposing its value.
 * Used by the health check endpoint.
 */
export function envExists(key: string): boolean {
  const value = process.env[key]
  return typeof value === "string" && value.trim() !== ""
}
