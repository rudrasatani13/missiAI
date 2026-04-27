# CLAUDE.md — missiAI Project Intelligence
# Auto-generated from full codebase scan. Update manually when patterns change.

## Stack
- **Framework:** Next.js 15.5.15 (App Router), React 19, TypeScript 5 strict
- **Auth:** Clerk (`@clerk/nextjs` 6.39.0)
- **AI:** Google Gemini 2.5 Flash/Pro via Vertex AI (`@google/genai` 1.49.0); Gemini STT/TTS via Vertex AI; optional OpenAI/Claude fallback providers
- **Payments:** Dodo Payments (REST + Standard Webhooks)
- **Storage:** Cloudflare KV (`MISSI_MEMORY`), Cloudflare Vectorize (`LIFE_GRAPH`)
- **Deployment:** OpenNext Cloudflare (`@opennextjs/cloudflare`) with a custom worker entry for live relay traffic
- **Testing:** Vitest; Linting: ESLint

## Runtime Rules
- API routes that need Cloudflare bindings should prefer the centralized helpers in `lib/server/platform/bindings.ts`
```ts
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from "@/lib/server/platform/bindings"

const kv = getCloudflareKVBinding()
const lifeGraph = getCloudflareVectorizeEnv()
```
- No Node.js APIs anywhere — all code must be edge-runtime compatible

## Project Structure
```
app/api/v1/          # Versioned API routes (chat, tts, stt, memory, billing, streak, plugins, etc.)
app/api/webhooks/    # dodo/route.ts — Dodo payment webhook handler
app/                 # Pages: chat, memory, streak, wind-down, pricing, admin, setup
lib/server/          # platform/, security/, observability/, chat/, cache/, routes/
lib/billing/         # tier-checker.ts, dodo-client.ts, usage-tracker.ts
lib/memory/          # life-graph.ts, life-graph-store.ts, vectorize.ts, embeddings.ts
lib/ai/              # providers/, live/, services/, agents/
lib/validation/      # schemas.ts, billing-schemas.ts, sanitizer.ts
lib/gamification/    # XP engine, streaks, achievements
lib/plugins/         # Plugin registry + Google Calendar/Notion executors
workers/            # entry.ts, runtime.ts, live relay handlers, durable objects
types/               # billing.ts, memory.ts, gamification.ts, chat.ts, quests.ts, etc.
middleware.ts        # Clerk auth + IP rate limiting + security headers
wrangler.toml        # Cloudflare Workers config + KV/Vectorize bindings
```

## Auth Pattern
```ts
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/security/auth"

// In every protected route handler:
let userId: string
try {
  userId = await getVerifiedUserId()
} catch (e) {
  if (e instanceof AuthenticationError) return unauthorizedResponse()
  throw e
}
```
- `getVerifiedUserId(): Promise<string>` — calls `auth()` from `@clerk/nextjs/server`, throws `AuthenticationError` if no session
- `unauthorizedResponse()` — returns `{ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }` with status 401
- **userId MUST come from:** `getVerifiedUserId()` only
- **userId MUST NEVER come from:** request body, query params, headers, or any client-supplied value

## Security Patterns

### timingSafeCompare
Defined inline in `lib/billing/dodo-client.ts` (not exported). Used only in `verifyDodoWebhook` for constant-time signature comparison. Do not export or use elsewhere — pattern is: `let result = 0; for (let i=0; i<a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i); return result === 0`

### Webhook HMAC Validation Flow (Dodo / Standard Webhooks)
```ts
import { verifyDodoWebhook } from '@/lib/billing/dodo-client'

// In webhook route:
const rawBody = await req.text()                          // 1. Read raw body as text
const webhookId        = req.headers.get('webhook-id')   // 2. Extract Standard Webhook headers
const webhookSignature = req.headers.get('webhook-signature')
const webhookTimestamp = req.headers.get('webhook-timestamp')
const isValid = await verifyDodoWebhook(rawBody, {        // 3. Verify HMAC-SHA256
  'webhook-id': webhookId,
  'webhook-signature': webhookSignature,
  'webhook-timestamp': webhookTimestamp,
}, process.env.DODO_WEBHOOK_SECRET!)
if (!isValid) return new Response(JSON.stringify({ received: false, error: 'Invalid signature' }), { status: 401 })
```
Verification details: timestamp ±5 min check, strip `whsec_` prefix, HMAC-SHA256 of `"{id}.{timestamp}.{body}"`, supports multiple space-separated `v1,{base64}` signatures.

### logSecurityEvent
```ts
import { logSecurityEvent } from "@/lib/server/observability/logger"

logSecurityEvent("security.bot_ua_detected", {
  ip,
  userAgent: ua ?? undefined,
  path: request.nextUrl.pathname,
  metadata: { effectiveLimit },
})
```
Call for: bot UA detection, rate-limit escalation, webhook replay attempts, any unusual traffic pattern.

### Other Security Utilities
- `logAuthEvent(event, { userId?, ip?, userAgent?, path?, outcome, reason? })` — `@/lib/server/observability/logger` — for sign-in, sign-out, 401, admin checks
- `logApiError(event, error, { userId?, httpStatus, path?, ip? })` — `@/lib/server/observability/logger` — for all API error responses with HTTP status
- `sanitizeInput` from `@/lib/validation/sanitizer` — applied via Zod `.transform(sanitizeInput)` on all string inputs
- Security headers applied in `middleware.ts` to every API response: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'; img-src 'self' data: blob:`, `Referrer-Policy: strict-origin-when-cross-origin`

## Validation Pattern
All inputs validated with Zod. Import from the canonical schema file:
```ts
import { chatSchema, validationErrorResponse } from "@/lib/validation/schemas"
// or via re-export barrel:
import { chatSchema, validationErrorResponse } from "@/lib/validation"

const parsed = chatSchema.safeParse(body)
if (!parsed.success) return validationErrorResponse(parsed.error)
const { messages, personality } = parsed.data
```
`validationErrorResponse(error: z.ZodError)` returns `{ success: false, error: "Validation error: {path} — {message}", code: "VALIDATION_ERROR" }` with status 400.

Example schema from `lib/validation/schemas.ts`:
```ts
export const chatSchema = z.object({
  messages: z.array(messageSchema).min(1).max(20),
  personality: z.enum(["assistant","bestfriend","professional","playful","mentor","custom"]).optional().default("assistant"),
  customPrompt: z.string().max(2000).transform(sanitizeInput).optional(),
  maxOutputTokens: z.number().min(100).max(2000).optional(),
  memories: z.string().max(10000).transform(sanitizeInput).optional(),
  voiceDurationMs: z.number().min(0).max(300000).optional(),
})
```

## API Response Shape
**Success:**
```ts
{ success: true, data?: T }
```
**Error:**
```ts
{ success: false, error: string, code?: string }
```
**HTTP status codes:**
- 200 — success
- 400 — validation error (`VALIDATION_ERROR`)
- 401 — unauthenticated (`UNAUTHORIZED`)
- 403 — forbidden (admin routes)
- 413 — payload too large (`PAYLOAD_TOO_LARGE`)
- 429 — rate limited or voice limit exceeded (`USAGE_LIMIT_EXCEEDED`), with `Retry-After` header
- 503 — KV unavailable (`SERVICE_UNAVAILABLE`) or Clerk auth service down
- 500 — internal error (`INTERNAL_ERROR`)

**Streaming (chat):** `Content-Type: text/event-stream`, SSE format:
```
data: {"text":"chunk"}\n\n
data: [DONE]\n\n
```

## AI / Gemini Pipeline
1. Route (`app/api/v1/chat/route.ts`) authenticates, validates, checks plan + rate limit
2. Fetches `searchLifeGraph()` for relevant memory (6s timeout, topK=5)
3. Calls `buildSystemPrompt(personality, memories, customPrompt)` from `lib/ai/services/ai-service.ts`
4. `selectGeminiModel(messages, memories)` from `lib/ai/providers/model-router.ts` picks model; voice requests always use `gemini-2.5-flash`
5. `buildGeminiRequest()` + `streamGeminiResponse()` from `lib/ai/providers/gemini-stream.ts` streams to client as SSE
6. Post-stream: cost tracking, analytics, mood capture, response cache write — all fire-and-forget

**Personality system prompt location:** `lib/ai/services/ai-service.ts` — `PERSONALITIES` record. Five built-in: `assistant`, `bestfriend`, `professional`, `playful`, `mentor`. Custom injects `customPrompt` + `CORE_RULES_FOR_CUSTOM`.

**Core trait (all personalities):** Brutally honest, never sugarcoat. Always respond in English regardless of input language.

**Non-streaming (internal use):** `generateResponse()` and `callAIDirect()` from `lib/ai/services/ai-service.ts` return `Promise<string>`.

## Memory System

### Life Graph
```ts
import { getLifeGraphReadSnapshot, addOrUpdateNode, searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"

// v2 storage is managed by lib/memory/life-graph-store.ts key builders
const graph = await getLifeGraphReadSnapshot(kv, userId)   // read
const node = await addOrUpdateNode(kv, vectorizeEnv, userId, nodeInput)  // upsert single node
const results = await searchLifeGraph(kv, vectorizeEnv, userId, query, { topK: 5 })
const prompt = formatLifeGraphForPrompt(results)           // format for system prompt (max 8 nodes)
```
Dual-search: Vectorize first (semantic, minScore 0.65), KV keyword fallback if Vectorize unavailable or no results. Access counts updated on every search.

### Vectorize
```ts
import { upsertLifeNode, searchSimilarNodes, deleteUserVectors } from "@/lib/memory/vectorize"

await upsertLifeNode(env, node, embedding)
const results = await searchSimilarNodes(env, queryEmbedding, userId, { topK, category, minScore })
await deleteUserVectors(env, nodeIds)
```
Index binding: `LIFE_GRAPH` (index name: `missiai-life-graph`). Filter by `userId` metadata on every query.

### KV Namespace
Binding name: `MISSI_MEMORY` (ID: `ddf2e5eb21484fd1a9aecd8e4eaada74`)

## Billing / Plan Gating
```ts
import { getUserPlan, setUserPlan, getUserBillingData } from "@/lib/billing/tier-checker"

const planId = await getUserPlan(userId)  // returns PlanId: 'free' | 'plus' | 'pro'
```
Plan stored in Clerk `publicMetadata.plan`. Falls back to `'free'` if missing or unknown value.

**Plan values:** `free` (10 min/day voice, 1 personality, 20 memory facts), `plus` ($9/mo, 120 min/day, 4 personalities, unlimited facts), `pro` ($19/mo, unlimited voice, API access)

**Gate a feature:**
```ts
const planId = await getUserPlan(userId)
if (planId === 'free') {
  return new Response(JSON.stringify({ success: false, error: "Upgrade required", code: "PLAN_LIMIT_EXCEEDED", upgrade: "/pricing" }), { status: 403 })
}
```

## Middleware
**Public routes** (no auth required):
```ts
const isPublicRoute = createRouteMatcher([
  "/", "/sign-in(.*)", "/sign-up(.*)", "/manifesto(.*)",
  "/privacy(.*)", "/terms(.*)", "/api/webhooks/dodo", "/pricing(.*)",
])
```
Health endpoint: `/api/health` — public, separate lower rate limit (20 req/min).

**Rate limiting (IP-based, per-isolate sliding window):**
- Standard API: 100 req/min per IP (halved to 50 for bot UAs)
- Health endpoint: 20 req/min per IP
- Auth pages (`/sign-in`, `/sign-up`): 30 req/5 min per IP
- Violation escalation: after 3 violations in 10 min, `Retry-After` doubled
- Response headers on 429: `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**IP extraction:**
```ts
// cf-connecting-ip first (Cloudflare), then x-forwarded-for first segment
request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
```

**Admin access check:** Clerk `sessionClaims.metadata.role === "admin"` OR `authObj.userId === process.env.ADMIN_USER_ID`. Both checked in middleware (pages) and route handlers (API).

**New API routes:** API routes handle their own auth via `getVerifiedUserId()` — do NOT call `auth.protect()` in middleware for API routes (causes HTML redirect instead of JSON 401).

## KV Patterns
```ts
// Access via getRequestContext():
const { env } = getRequestContext()
const kv: KVStore = (env as any).MISSI_MEMORY

// KVStore interface (types/index.ts):
kv.get(key)                                    // Promise<string | null>
kv.put(key, value, { expirationTtl?: number }) // Promise<void>
kv.delete(key)                                 // Promise<void>

// TTL example (24h):
await kv.put(`webhook:event:${eventId}`, '1', { expirationTtl: 86400 })
```

## Existing KV Key Schema
| Key pattern | Value shape | TTL |
|---|---|---|
| `lifegraph:v2:meta:{userId}` | JSON `LifeGraphMeta` | none |
| `lifegraph:v2:index:{userId}` | JSON `LifeGraphIndex` | none |
| `lifegraph:v2:node:{userId}:{nodeId}` | JSON `LifeNode` | none |
| `dodo:sub:{subscriptionId}` | `userId` string | none |
| `webhook:event:{type}:{webhookId}` | `"1"` (processed flag) | 86400s (24h) |
| `usage:{userId}:{date}` | JSON `DailyUsage` (voice seconds) | ~48h |
| `proactive:{userId}` | JSON `ProactiveConfig` | none |
| `analytics:{userId}:{date}` | JSON analytics snapshot | none |
| `persona:{userId}` | persona ID string | none |
| `cache:{hash}` | cached AI response string | varies |

## Type Definitions
| Type | File | Description |
|---|---|---|
| `PlanId` | `types/billing.ts` | `'free' \| 'plus' \| 'pro'` |
| `PlanConfig` | `types/billing.ts` | Plan limits: voiceMinutesPerDay, maxMemoryFacts, etc. |
| `UserBilling` | `types/billing.ts` | User billing state from Clerk publicMetadata |
| `LifeNode` | `types/memory.ts` | Single memory fact (id, userId, category, title, detail, tags, people, emotionalWeight, confidence, timestamps, accessCount, source) |
| `LifeGraph` | `types/memory.ts` | Collection of LifeNodes + metadata |
| `MemoryCategory` | `types/memory.ts` | `'person'\|'goal'\|'habit'\|'preference'\|'event'\|'emotion'\|'skill'\|'place'\|'belief'\|'relationship'` |
| `MemorySearchResult` | `types/memory.ts` | `{ node, score, reason }` |
| `PersonalityKey` | `types/index.ts` | `"assistant"\|"bestfriend"\|"professional"\|"playful"\|"mentor"\|"custom"` |
| `KVStore` | `types/index.ts` | `{ get, put, delete }` — minimal edge-compatible KV interface |
| `Message` | `types/index.ts` | `{ role: "user"\|"assistant", content: string, image?: string }` |
| `GamificationData` | `types/gamification.ts` | XP, level, avatarTier, habits, achievements, loginStreak |
| `AvatarTier` | `types/gamification.ts` | 6 tiers: Spark → Ember → Flame → Blaze → Nova → Cosmic |
| `Quest` | `types/quests.ts` | Long-form goal with chapters and missions |
| `DailyBrief` | `types/daily-brief.ts` | Daily task list and nudges |
| `VectorizeEnv` | `lib/memory/vectorize.ts` | `{ LIFE_GRAPH: VectorizeIndex }` |

## Webhook Pattern
**Existing webhooks:**
- `POST /api/webhooks/dodo` — Dodo payment events (public route, no Clerk auth). Handles: `subscription.active`, `subscription.renewed`, `subscription.cancelled`, `subscription.failed`, `subscription.on_hold`, `subscription.plan_changed`. Returns 200 after successful verification/processing, but may return 401 or 500 on malformed or unauthenticated requests.

**HMAC validation pattern to replicate for new webhooks:**
1. `rawBody = await req.text()` — read before anything else
2. Extract `webhook-id`, `webhook-signature`, `webhook-timestamp` headers
3. Validate timestamp within ±5 min: `Math.abs(now - timestampSec) > 300`
4. Strip secret prefix, base64-decode key, HMAC-SHA256 of `"{id}.{timestamp}.{body}"`
5. Timing-safe compare against each `v1,{base64}` in space-separated signature header
6. Deduplicate via KV: `webhook:event:{type}:{id}` with 86400s TTL

## Services Layer
| File | Exports | Purpose |
|---|---|---|
| `lib/ai/services/ai-service.ts` | `buildSystemPrompt`, `generateResponse`, `callAIDirect` | Personality prompts and non-streaming AI calls |
| `lib/ai/services/voice-service.ts` | `geminiTextToSpeech`, `geminiSpeechToText` | Gemini TTS/STT via Vertex AI |

## Environment Variables
**AI:**
- `GOOGLE_SERVICE_ACCOUNT_JSON`, `VERTEX_AI_PROJECT_ID`, `VERTEX_AI_LOCATION`
- `AI_BACKEND` — currently must remain `"vertex"`
- `OPENAI_API_KEY`, `ENABLE_OPENAI_FALLBACK`, `ANTHROPIC_API_KEY` (optional provider fallbacks)

**Auth:**
- `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `ADMIN_USER_ID`

**Payments:**
- `DODO_PAYMENTS_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_PLUS_PRODUCT_ID`, `DODO_PRO_PRODUCT_ID`
- `DODO_PAYMENTS_MODE` — set to `"test_mode"` to use test API base URL

**Integrations:**
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (Google Calendar OAuth)
- `NOTION_API_KEY`
- `VAPID_PRIVATE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (Web Push)

**App:**
- `MISSI_KV_ENCRYPTION_SECRET` — required in production for encrypted KV, confirmation tokens, boss tokens, and live relay tickets
- `NEXT_PUBLIC_APP_URL` — defaults to `"https://missi.space"`
- `DAILY_BUDGET_USD` — set in `wrangler.toml` vars (default `"5.0"`)

**Secrets set via:** `wrangler secret put <NAME>` or Cloudflare dashboard environment settings (encrypted). Never commit values.

## Deployment
- **Platform:** Cloudflare via OpenNext Cloudflare + `workers/entry.ts`
- **Build:** `pnpm build:cf` — uses OpenNext Cloudflare (`@opennextjs/cloudflare`)
- **Deploy:** `pnpm deploy:cf`
- **Output dir:** `.open-next/assets` (set in `wrangler.toml`)
- **Compatibility date:** `2024-09-23`, flags: `["nodejs_compat"]`
- **KV binding:** `MISSI_MEMORY` (id: `ddf2e5eb21484fd1a9aecd8e4eaada74`, preview: `ed3c69b0ac8749e4ba80d58d262fd97f`)
- **Vectorize binding:** `LIFE_GRAPH` (index: `missiai-life-graph`)
- **Durable Object binding:** `ATOMIC_COUNTER` (`AtomicCounterDO`)

## Coding Conventions
- **Imports:** Absolute paths via `@/` alias (e.g. `@/lib/server/security/auth`, `@/types/billing`)
- **Async:** `async/await` throughout; `Promise.race()` for timeouts; fire-and-forget with `.catch(() => {})`
- **Error handling:** `try/catch` in route handlers; never let unknown errors reach the client; always log with appropriate logger function before returning error response
- **Zod:** `safeParse()` (not `parse()`) — handle failure before destructuring data
- **Streaming:** Return `new Response(readableStream, { headers: { "Content-Type": "text/event-stream", ... } })`
- **Non-blocking post-processing:** analytics, cache writes, mood analysis — all `.catch(() => {})` fire-and-forget after stream closes
- **Type assertions:** `(env as any).MISSI_MEMORY` for Cloudflare bindings — known pattern, not a bug

## What NOT To Do
- **Never trust client userId** — always `getVerifiedUserId()`, never `req.body.userId`
- **Never add Node.js APIs** — no `fs`, `path`, `process.nextTick`, `Buffer` (only `Uint8Array`/`ArrayBuffer`)
- **Never call `auth.protect()` for API routes in middleware** — causes HTML redirect instead of JSON 401
- **Never log secrets or full stack traces** — `logApiError` logs sanitized message only
- **Never skip Dodo webhook verification** — reject missing-secret or invalid-signature requests before processing
- **Never commit secrets to wrangler.toml or .env files** — use `wrangler secret put` or Pages dashboard
- **Never use `btoa`/`atob` for crypto** — use `crypto.subtle` (available in edge runtime)
- **Never block the chat response for non-critical work** — memory extraction, analytics, mood analysis must be fire-and-forget
- **Never skip idempotency on webhook events** — check `webhook:event:{type}:{id}` in KV before processing
- **Never use wildcard CORS** — ALLOWED_ORIGINS is an explicit allowlist in `middleware.ts`
- **Never read audio File directly in edge runtime** — buffer to `ArrayBuffer` first, then create fresh `Blob` (see `voice.service.ts:62-65`)
