// Server-only utilities for environment variables

// ─── Typed Environment Variables ──────────────────────────────────────────────
//
// Single source of truth for required env vars. Throws a clear error with the
// missing key name so deployment issues surface immediately.

// CFG-2 FIX: Added Razorpay environment variables to the interface
export interface AppEnv {
  GEMINI_API_KEY: string
  ELEVENLABS_API_KEY: string
  ELEVENLABS_VOICE_ID: string
  CLERK_SECRET_KEY: string
  DAILY_BUDGET_USD: number
  NODE_ENV: string
  RAZORPAY_KEY_ID: string
  RAZORPAY_KEY_SECRET: string
  RAZORPAY_WEBHOOK_SECRET: string
  RAZORPAY_PRO_PLAN_ID: string
  RAZORPAY_BUSINESS_PLAN_ID: string
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
    ELEVENLABS_VOICE_ID: requireEnv("ELEVENLABS_VOICE_ID"),
    CLERK_SECRET_KEY: requireEnv("CLERK_SECRET_KEY"),
    DAILY_BUDGET_USD: parseFloat(process.env.DAILY_BUDGET_USD ?? "5.0") || 5.0,
    NODE_ENV: process.env.NODE_ENV ?? "production",
    RAZORPAY_KEY_ID: requireEnv("RAZORPAY_KEY_ID"),
    RAZORPAY_KEY_SECRET: requireEnv("RAZORPAY_KEY_SECRET"),
    RAZORPAY_WEBHOOK_SECRET: requireEnv("RAZORPAY_WEBHOOK_SECRET"),
    RAZORPAY_PRO_PLAN_ID: requireEnv("RAZORPAY_PRO_PLAN_ID"),
    RAZORPAY_BUSINESS_PLAN_ID: requireEnv("RAZORPAY_BUSINESS_PLAN_ID"),
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
