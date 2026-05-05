# Security Runbook — missiAI Production

This document is the authoritative security checklist for deploying and operating
missiAI in production on Cloudflare (OpenNext runtime + Workers KV + Vectorize).

**Domain:** [missi.space](https://missi.space)

---

## 1. Authentication & Authorization

### Clerk Middleware

All non-public routes are protected by Clerk middleware (`middleware.ts`).

**Public routes** (no auth required):
- `/` (landing page)
- `/sign-in`, `/sign-up`
- `/pricing`, `/privacy`, `/terms`, `/manifesto`
- `/api/health`
- `/api/webhooks/dodo` (verified via webhook signature)
- `/api/webhooks/whatsapp` (verified via HMAC-SHA256 signature; see §13)
- `/api/webhooks/telegram` (verified via secret-token header; see §13)

**Protected routes** (Clerk session required):
- `/chat`, `/memory`, `/streak`, `/wind-down`, `/setup`
- All `/api/v1/*` endpoints
- `/admin` (additionally requires `ADMIN_USER_ID` match)

### Admin Access

The admin dashboard (`/admin`, `/api/v1/admin/*`) is restricted to a single
Clerk user ID defined in `ADMIN_USER_ID`. All admin API routes verify this
before processing.

---

## 2. HTTPS Enforcement

HSTS headers are emitted on every response via `next.config.mjs`:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

### Cloudflare Settings

| Setting | Location | Required Value |
|---------|----------|---------------|
| Always Use HTTPS | SSL/TLS > Edge Certificates | **On** |
| Minimum TLS Version | SSL/TLS > Edge Certificates | **TLS 1.2** |
| HTTP/2 | Speed > Optimization | **Enabled** |
| Opportunistic Encryption | SSL/TLS > Edge Certificates | **On** |

**Verification:**
```bash
# Must return HTTP 301 -> https://
curl -I http://missi.space

# Must include HSTS header
curl -sI https://missi.space | grep -i strict-transport
```

### HSTS Preload

The `preload` directive is set. Submit at https://hstspreload.org once all
subdomains support HTTPS. Preloading is a one-way commitment.

---

## 3. Secrets Management

### Principle

All secrets belong **only** in:
- Cloudflare dashboard > Settings > Environment variables (encrypted)
- `wrangler secret put <NAME>` for Worker secrets
- Local `.env.*.local` files (**never committed**, listed in `.gitignore`)

**Never** put secrets in:
- `wrangler.toml` `[vars]` section (plaintext, committed)
- `next.config.mjs` or any committed source file
- Client-side code (only `NEXT_PUBLIC_*` variables are safe for the browser)

### Required Secrets & Protected Runtime Values

```bash
# AI & Voice
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON

# Authentication
wrangler secret put CLERK_SECRET_KEY
wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# Payments
wrangler secret put DODO_PAYMENTS_API_KEY
wrangler secret put DODO_WEBHOOK_SECRET
wrangler secret put DODO_PLUS_PRODUCT_ID
wrangler secret put DODO_PRO_PRODUCT_ID

# Admin
wrangler secret put ADMIN_USER_ID

# KV encryption / confirmation tokens
wrangler secret put MISSI_KV_ENCRYPTION_SECRET

# Push Notifications
wrangler secret put VAPID_PRIVATE_KEY

# OAuth Integrations (if enabled)
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put NOTION_CLIENT_ID
wrangler secret put NOTION_CLIENT_SECRET

# Verify (values are redacted in output)
wrangler secret list
```

Also set `VERTEX_AI_PROJECT_ID` as a runtime environment variable. `VERTEX_AI_LOCATION` is optional and defaults to `us-central1`.

### Runtime behavior

- `MISSI_KV_ENCRYPTION_SECRET` is required in production for KV encryption, agent confirmation tokens, boss tokens, and live relay tickets.
- Missing or empty `MISSI_KV_ENCRYPTION_SECRET` now fails closed with a 503 on routes that need it.
- Confirmation tokens are single-use and are not generated with fallback secrets.
- The live tools endpoint does not allow direct outbound email; confirmation is required for any send.
- Per-isolate IP rate limiting is a burst guard only; Cloudflare WAF / Rate Limiting rules are still required for distributed abuse.

---

## 4. Database & Storage Access

### Cloudflare KV (`MISSI_MEMORY`)

KV is **not publicly accessible**. It is only reachable via the Workers runtime
binding in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MISSI_MEMORY"
id = "ddf2e5eb21484fd1a9aecd8e4eaada74"
```

**Access model:**
- Code accesses KV through the centralized Cloudflare binding helpers (for example, `getCloudflareKVBinding()` in `lib/server/platform/bindings.ts`)
- No HTTP API is exposed — the binding is the only access path
- The KV namespace ID is a resource identifier, not a credential
- Only the deployed Worker with the binding can read/write the namespace

### Cloudflare Vectorize (`missiai-life-graph`)

Vector embeddings for semantic memory search are stored in Cloudflare Vectorize.
Access is restricted to the Workers runtime binding — no external API exposure.

### Data Isolation

All user data is keyed by Clerk user ID. API routes extract the authenticated
user ID from the Clerk session and scope all KV/Vectorize operations to that ID.
There is no cross-user data access path.

---

## 5. Input Validation & Sanitization

### API Input Validation

All API request bodies are validated using **Zod schemas** (`lib/validation/schemas.ts`).
Invalid payloads are rejected with 400 responses before reaching business logic.

**Additional guards:**
- Payload size limits on all POST endpoints
- Maximum input length enforced on chat messages and memory content
- File upload restricted to image types with size caps

### Memory Sanitization

Facts extracted from conversations are sanitized (`lib/memory/memory-sanitizer.ts`)
before being written to KV. This prevents injection of malicious content into
the stored knowledge graph.

### Token Counting

A token estimation module (`lib/memory/token-counter.ts`) prevents prompt
injection via excessively large memory context windows.

---

## 6. Rate Limiting

missiAI uses **dual-layer rate limiting**:

1. **IP-based burst guard** — in-memory, applied in middleware to all API routes.
   Prevents rapid-fire requests from a single IP.
   - This is per-isolate on Cloudflare Workers and does not provide global distributed protection.
   - Add Cloudflare WAF / Rate Limiting rules for distributed abuse.

2. **Per-user KV-backed limits** — applied in route handlers. Tracks usage per
   authenticated Clerk user ID with configurable windows and thresholds.

### Budget Controls

A daily API spend tracker (`DAILY_BUDGET_USD`, default: $5.00) monitors
Gemini model usage and text-to-speech spend. When the budget threshold is approached,
the system throttles non-essential API calls.

---

## 7. Webhook Security

### Dodo Payments Webhook

The `/api/webhooks/dodo` endpoint verifies webhook signatures using the
**Standard Webhooks** specification:

- The `DODO_WEBHOOK_SECRET` is used to verify the `webhook-signature` header
- Invalid signatures are rejected with 401 before any processing occurs
- Webhook events are idempotent — duplicate delivery does not cause issues

### WhatsApp Webhook

- Requires `WHATSAPP_APP_SECRET` for HMAC verification and `WHATSAPP_VERIFY_TOKEN` for subscription setup.
- Missing env fails closed.
- Invalid signatures return 401; replayed messages older than 5 minutes are ignored.
- Invalid payloads are not silently accepted.

### Telegram Webhook

- Requires `TELEGRAM_WEBHOOK_SECRET`.
- Missing env fails closed.
- Invalid secret-token headers return 401.
- `/start {code}` linking codes are single-use and time-limited.

---

## 8. Security Headers

All responses include security headers via `next.config.mjs`:

```bash
curl -sI https://missi.space | grep -iE \
  "strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|content-security"
```

**Expected headers:**

| Header | Value |
|--------|-------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=(), interest-cohort=()` |
| `Content-Security-Policy` | `frame-ancestors 'none'` |

---

## 9. OAuth Integration Security

### Google Calendar

- OAuth 2.0 authorization code flow with PKCE
- Tokens stored in KV, scoped to user's Clerk ID
- Refresh tokens are encrypted at rest in KV
- Scopes limited to `calendar.readonly` and `calendar.events`

### Notion

- OAuth 2.0 authorization code flow
- Access tokens stored in KV, scoped to user's Clerk ID
- Scopes limited to read access on pages and databases

### Token Handling

- OAuth tokens are **never** exposed to the client
- Refresh is handled server-side in API routes
- Disconnecting a plugin immediately deletes stored tokens from KV

### Admin policy

- `/admin` and `/api/v1/admin/*` require Clerk auth plus either `publicMetadata.role === "admin"` or `ADMIN_USER_ID`.
- Sensitive admin mutations should use step-up re-auth where practical.

---

## 10. Key Rotation Procedure (Incident Response)

If a secret is suspected to be compromised, follow the steps below.

### Vertex AI Service Account
1. Rotate key in Google Cloud Console > IAM & Admin > Service Accounts
2. Download new JSON key
3. `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`
4. Update in Cloudflare dashboard environment settings (Production + Preview)

### MISSI_KV_ENCRYPTION_SECRET

**Format requirement:** Minimum 32 characters. Recommended: 44+ characters from
`openssl rand -base64 32` (256-bit entropy). Shorter values are **rejected in
production** (fail closed — returns 500/503, not a degraded fallback).

**Secret format rules:**
- Do NOT use short passphrases, repeated characters, or dictionary words
- Do NOT log or print the secret value anywhere
- Do NOT use `openssl rand -hex 16` (gives only 128-bit entropy)
- **Use:** `openssl rand -base64 32` → 44-char string, 256-bit entropy

**Migration risk:** The `enc:v1:` key derivation uses the first 32 bytes of the
secret as the raw AES-256 key (truncates longer secrets; rejects shorter ones).
Changing or rotating the secret **does not break existing** `enc:v1:` KV values
as long as the new secret's first 32 chars are identical to the old secret's
first 32 chars. If the first 32 chars change, existing `enc:v1:` ciphertext
will fail to decrypt. Plan a re-encryption pass for OAuth tokens and plugin
credentials before rotating if the first 32 chars will differ.

**Rotation steps:**
1. `openssl rand -base64 32` → copy the 44-char result
2. `wrangler secret put MISSI_KV_ENCRYPTION_SECRET`
3. Update in Cloudflare dashboard environment settings (Production + Preview)
4. **Impact:** Existing confirmation, boss-token, and live relay tickets signed
   with the old secret will stop validating (users retry; no data loss).
   OAuth tokens stored as `enc:v1:` will fail to decrypt if first 32 chars
   changed — affected users must reconnect their integrations.

### Dodo Payments API Key
1. Revoke at https://app.dodopayments.com > Developer > API
2. Create a new key
3. `wrangler secret put DODO_PAYMENTS_API_KEY`

### Dodo Webhook Secret
1. Regenerate at Dodo dashboard > Webhooks
2. `wrangler secret put DODO_WEBHOOK_SECRET`
3. Verify webhook signature validation end-to-end

### Clerk Secret Key
1. Roll at https://dashboard.clerk.com > API Keys
2. `wrangler secret put CLERK_SECRET_KEY`
3. **Impact:** All existing sessions are invalidated — users will be signed out

### VAPID Private Key
1. Generate new key pair: `npx web-push generate-vapid-keys`
2. `wrangler secret put VAPID_PRIVATE_KEY`
3. Update `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in env
4. **Impact:** Existing push subscriptions will fail until users re-subscribe

### Google / Notion OAuth Credentials
1. Revoke in the respective developer console
2. Generate new credentials
3. Update via `wrangler secret put` for both `CLIENT_ID` and `CLIENT_SECRET`
4. **Impact:** Users will need to reconnect their integrations

---

## 11. Secret Scanning in CI

The CI pipeline runs [TruffleHog](https://github.com/trufflesecurity/trufflehog)
on every push to scan for accidentally committed secrets. If a secret pattern is
detected, the build fails and alerts the team before the commit reaches `main`.

See `.github/workflows/ci.yml` for the scanning step configuration.

---

## 13. Bot Webhook Security

### WhatsApp (Meta Cloud API) — `app/api/webhooks/whatsapp/route.ts`

Validation is enforced in strict order before any KV, memory, or AI operation:

1. **Signature verification (HMAC-SHA256)**
   - Header: `X-Hub-Signature-256: sha256=<hex-digest>`
   - Key: `WHATSAPP_APP_SECRET` (raw UTF-8 bytes, from env)
   - Message: raw request body (read once before anything else)
   - Comparison: `timingSafeCompare(computedHex, providedHex)` — constant-time, no string equality
   - Failure: HTTP 401 immediately, no further processing

2. **Replay attack protection (timestamp validation)**
   - `message.timestamp` is checked against `Date.now()` — reject if `|now - ts| > 300s`
   - Failures are logged as `security.bot.wa.replay_attempt` and the message is silently skipped

3. **Message deduplication**
   - `bot:dedup:wa:{messageId}` → `"1"` with 7-day TTL in KV
   - Checked before any processing; duplicate messages are silently dropped

4. **userId resolution from KV (never from payload)**
   - Sender phone → `bot:wa:{phone}` → Clerk userId
   - Unknown senders get an onboarding reply; no AI or memory operations run

5. **Plan gate**
   - Requires Pro plan (`getUserPlan(userId) === 'pro'`)
   - Blocked users receive an upgrade prompt; logged as `security.bot.wa.plan_gate_blocked`

6. **Daily message limit**
   - Counter: `bot:daily:wa:{userId}:{date}` — capped at 200 messages/day
   - KV-backed, TTL 48 h

7. **HTTP response policy**
   - **401** returned immediately on invalid HMAC signature — intentional fail-closed; invalid payloads are never silently accepted even though Meta retries non-200 responses.
   - **200** returned for all other cases (valid sig + transient error, parse failure, unknown sender, plan block, etc.) to prevent Meta retry storms on recoverable conditions.
   - All AI processing after a valid 200 response is fire-and-forget via `waitUntil()`.

### Telegram Bot API — `app/api/webhooks/telegram/route.ts`

1. **Secret token verification**
   - Header: `X-Telegram-Bot-Api-Secret-Token: <token>`
   - Compared with `TELEGRAM_WEBHOOK_SECRET` using `timingSafeCompare` — constant-time
   - Failure: HTTP 401 immediately

2. **Message deduplication**
   - `bot:dedup:tg:{updateId}` → `"1"` with 7-day TTL in KV

3. **userId resolution (never from payload)**
   - Telegram user ID → `bot:tg:{telegramId}` → Clerk userId

4. **Plan gate and daily limit** — identical to WhatsApp

### WhatsApp OTP Linking — `app/api/v1/bot/link/whatsapp/route.ts`

- OTP generated with `crypto.getRandomValues` (cryptographically random 6-digit code)
- Stored in KV: `bot:otp:{userId}` with 10-minute TTL
- **Single-use**: deleted immediately on first successful verification
- **Rate limited**: max 5 OTP requests per user per day (`bot:otp:attempts:{userId}:{date}`)
- OTP mismatch and expiry logged as `security.bot.wa.otp_verification_failed`

### Telegram Deep-Link — `app/api/v1/bot/link/telegram/route.ts`

- Code generated with `crypto.getRandomValues(32 bytes)` → 64 hex chars
- Stored in KV: `bot:tglink:{code}` with 15-minute TTL
- **Single-use**: deleted immediately when the `/start {code}` command is received

### General Security Properties

- All new API endpoints follow the same auth pattern: `getVerifiedUserId()` for user-facing routes (userId always from Clerk, never from request body)
- All user message text is passed through `sanitizeInput` from `lib/validation/sanitizer.ts` before being sent to Gemini, preventing prompt injection via WhatsApp/Telegram
- No raw message content stored in KV deduplication keys — dedup keys store only `"1"`
- All security events (failed signatures, replay attempts, unknown senders, plan blocks) are logged with `logSecurityEvent` from `lib/server/logger.ts`
- Webhook endpoints are public (no Clerk auth) but still subject to IP-based rate limiting via `middleware.ts`
- WhatsApp 6-digit link codes are rate-limited to 10 attempts per sender phone per day (`bot:wa:link-attempts:{phone}:{date}`) to prevent brute-forcing the 1M-combination space within the 15-minute code TTL.

### Live Tools Endpoint (`/api/v1/tools/execute`)

This endpoint is called by the Gemini Live WebSocket client. It uses an explicit **safe-tool allowlist** rather than a general function-declaration allowlist:

- **Allowed**: read-only and non-destructive tools (`searchMemory`, `readCalendar`, `findFreeSlot`, `draftEmail`, `searchWeb`, `searchNews`, `searchYouTube`, `logExpense`, `getWeekSummary`, `updateGoalProgress`, `lookupContact`, `saveContact`, `setReminder`, `takeNote`, `createNote`).
- **Blocked** (return 400): `sendEmail`, `confirmSendEmail`, `createCalendarEvent`, `deleteCalendarEvent`, `updateCalendarEvent`. These require a server-issued confirmation token via the agent-confirm flow (`POST /api/v1/agents/plan` → `POST /api/v1/agents/confirm`).

### Admin Authorization

Both `/admin` pages and `/api/v1/admin/*` API routes require **two checks** (defense-in-depth):
1. Middleware verifies Clerk `publicMetadata.role === "admin"` OR `userId === ADMIN_USER_ID`.
2. Each admin API route handler re-verifies the same condition independently before processing the mutation.

The dual policy (role-based + env-var super-admin) is consistent across all admin surfaces.

---

## 12. Reporting Vulnerabilities

If you discover a security vulnerability in missiAI, please report it
responsibly:

- **Email:** security@missi.space
- **GitHub:** Open a private security advisory at
  [github.com/rudrasatani13/missiAI/security/advisories](https://github.com/rudrasatani13/missiAI/security/advisories)

Do not open public issues for security vulnerabilities. We will acknowledge
receipt within 48 hours and provide a fix timeline within 7 days.
