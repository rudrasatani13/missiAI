import { z } from 'zod';

// Server-only utilities for environment variables

// ─── Typed Environment Variables ─────────────────────────────────────────────
//
// Single source of truth for required env vars. Throws a clear error with the
// missing key name so deployment issues surface immediately.
//
// PRODUCTION: Set all secrets via `wrangler secret put <NAME>` or the
// Cloudflare Pages dashboard (Settings → Environment variables → Encrypted).
// See SECURITY.md for the full list and rotation procedure.

const emptyStringToUndefined = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() === '') {
    return undefined;
  }
  return val;
}, z.string().optional());

const requiredString = z.preprocess((val) => {
  if (typeof val === 'string' && val.trim() === '') {
    return undefined;
  }
  return val;
}, z.string({ required_error: "Missing required environment variable" }));

const envSchema = z.object({
  CLERK_SECRET_KEY: requiredString,
  DAILY_BUDGET_USD: z.preprocess(
    (val) => {
      if (typeof val === 'string') {
        const parsed = parseFloat(val);
        return isNaN(parsed) ? 5.0 : parsed;
      }
      return 5.0;
    },
    z.number()
  ),
  NODE_ENV: z.string().default("production"),
  DODO_PAYMENTS_API_KEY: requiredString,
  DODO_WEBHOOK_SECRET: requiredString,
  DODO_PRO_PRODUCT_ID: requiredString,
  DODO_PAYMENTS_MODE: z.string().default("live_mode"),
  VAPID_PRIVATE_KEY: emptyStringToUndefined,
  GOOGLE_CLIENT_ID: emptyStringToUndefined,
  GOOGLE_CLIENT_SECRET: emptyStringToUndefined,
  NOTION_CLIENT_ID: emptyStringToUndefined,
  NOTION_CLIENT_SECRET: emptyStringToUndefined,
  NOTION_API_KEY: emptyStringToUndefined,
  MISSI_KV_ENCRYPTION_SECRET: z.preprocess(
    (val) => {
      if (typeof val === 'string' && val.trim() === '') return undefined;
      return val;
    },
    z.string().min(32, "MISSI_KV_ENCRYPTION_SECRET must be at least 32 characters")
  ).optional(),
  APP_URL: z.preprocess(
    (_val, _ctx) => {
      if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
      if (process.env.APP_URL) return process.env.APP_URL;
      return "http://localhost:3000";
    },
    z.string()
  ),
  AI_BACKEND: z.literal('vertex').default('vertex'),
  VERTEX_AI_PROJECT_ID: emptyStringToUndefined,
  VERTEX_AI_LOCATION: emptyStringToUndefined,
  GOOGLE_SERVICE_ACCOUNT_JSON: emptyStringToUndefined,
  RESEND_API_KEY: emptyStringToUndefined,
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Returns a typed env object with all required keys validated.
 *
 * Call at the top of each API route to fail fast on misconfiguration.
 */
export function getEnv(): AppEnv {
  try {
    const env = envSchema.parse(process.env);
    if (env.NODE_ENV === 'production' && !env.MISSI_KV_ENCRYPTION_SECRET) {
      throw new Error('Missing or invalid required environment variable(s): MISSI_KV_ENCRYPTION_SECRET');
    }
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingKeys = error.issues.map((issue) => issue.path.join('.')).join(', ');
      throw new Error(`Missing or invalid required environment variable(s): ${missingKeys}`);
    }
    throw error;
  }
}

/**
 * Check if a specific env var exists without exposing its value.
 * Used by the health check endpoint.
 */
export function envExists(key: string): boolean {
  const value = process.env[key];
  return typeof value === "string" && value.trim() !== "";
}
