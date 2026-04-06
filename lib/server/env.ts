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
  GEMINI_API_KEY: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_VOICE_ID: string | undefined
  CLERK_SECRET_KEY: string
  DAILY_BUDGET_USD: number
  NODE_ENV: string
  DODO_PAYMENTS_API_KEY: string
  DODO_WEBHOOK_SECRET: string
  DODO_PRO_PRODUCT_ID: string
  DODO_BUSINESS_PRODUCT_ID: string
  DODO_PAYMENTS_MODE: string
  /** Web Push VAPID private key — required for sending push notifications. */
  VAPID_PRIVATE_KEY: string | undefined
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
    GEMINI_API_KEY: requireEnv("GEMINI_API_KEY"),
    ELEVENLABS_API_KEY: requireEnv("ELEVENLABS_API_KEY"),
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID || undefined,
    CLERK_SECRET_KEY: requireEnv("CLERK_SECRET_KEY"),
    DAILY_BUDGET_USD: parseFloat(process.env.DAILY_BUDGET_USD ?? "5.0") || 5.0,
    NODE_ENV: process.env.NODE_ENV ?? "production",
    DODO_PAYMENTS_API_KEY: requireEnv("DODO_PAYMENTS_API_KEY"),
    DODO_WEBHOOK_SECRET: requireEnv("DODO_WEBHOOK_SECRET"),
    DODO_PRO_PRODUCT_ID: requireEnv("DODO_PRO_PRODUCT_ID"),
    DODO_BUSINESS_PRODUCT_ID: requireEnv("DODO_BUSINESS_PRODUCT_ID"),
    DODO_PAYMENTS_MODE: process.env.DODO_PAYMENTS_MODE ?? "live_mode",
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
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
