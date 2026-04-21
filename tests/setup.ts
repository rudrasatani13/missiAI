import { vi } from "vitest"

// ─── Mock Environment Variables ───────────────────────────────────────────────

process.env.ELEVENLABS_API_KEY = "test-elevenlabs-key"
process.env.CLERK_SECRET_KEY = "test-clerk-secret"
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "test-clerk-pub"
process.env.DAILY_BUDGET_USD = "5.0"

// ─── Mock Cloudflare KV with in-memory Map ────────────────────────────────────

const store = new Map<string, string>()

const KV_NAMESPACE = {
  get: async (key: string): Promise<string | null> => store.get(key) ?? null,
  put: async (key: string, value: string): Promise<void> => {
    store.set(key, value)
  },
  delete: async (key: string): Promise<void> => {
    store.delete(key)
  },
}

;(globalThis as any).KV_NAMESPACE = KV_NAMESPACE

// ─── Mock fetch globally ──────────────────────────────────────────────────────

vi.stubGlobal(
  "fetch",
  vi.fn(async () => new Response("{}", { status: 200 }))
)
