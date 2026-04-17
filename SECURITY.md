# Security Runbook — missiAI Production

This document is the authoritative security checklist for deploying and operating
missiAI in production (Cloudflare Pages + Workers KV + Vectorize).

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
- Cloudflare Pages dashboard > Settings > Environment variables (encrypted)
- `wrangler secret put <NAME>` for Worker secrets
- Local `.env.*.local` files (**never committed**, listed in `.gitignore`)

**Never** put secrets in:
- `wrangler.toml` `[vars]` section (plaintext, committed)
- `next.config.mjs` or any committed source file
- Client-side code (only `NEXT_PUBLIC_*` variables are safe for the browser)

### Required Secrets

```bash
# AI & Voice
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID

# Authentication
wrangler secret put CLERK_SECRET_KEY
wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# Payments
wrangler secret put DODO_PAYMENTS_API_KEY
wrangler secret put DODO_WEBHOOK_SECRET
wrangler secret put DODO_PRO_PRODUCT_ID
wrangler secret put DODO_BUSINESS_PRODUCT_ID

# Admin
wrangler secret put ADMIN_USER_ID

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

### Cloudflare Pages Dashboard

1. Go to **Cloudflare Pages** > select `missiai` project
2. Navigate to **Settings > Environment variables**
3. Click **Add variable** > enter name and value > toggle **Encrypt**
4. Set the same variables for both **Production** and **Preview** environments

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
- Code accesses KV only via `getRequestContext().env.MISSI_MEMORY`
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

All API request bodies are validated using **Zod schemas** (`lib/validation.ts`).
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

2. **Per-user KV-backed limits** — applied in route handlers. Tracks usage per
   authenticated Clerk user ID with configurable windows and thresholds.

### Budget Controls

A daily API spend tracker (`DAILY_BUDGET_USD`, default: $5.00) monitors
Gemini and ElevenLabs API costs. When the budget threshold is approached,
the system throttles non-essential API calls.

---

## 7. Webhook Security

### Dodo Payments Webhook

The `/api/webhooks/dodo` endpoint verifies webhook signatures using the
**Standard Webhooks** specification:

- The `DODO_WEBHOOK_SECRET` is used to verify the `webhook-signature` header
- Invalid signatures are rejected with 401 before any processing occurs
- Webhook events are idempotent — duplicate delivery does not cause issues

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

---

## 10. Key Rotation Procedure (Incident Response)

If a secret is suspected to be compromised, follow the steps below.

### Vertex AI Service Account
1. Rotate key in Google Cloud Console > IAM & Admin > Service Accounts
2. Download new JSON key
3. `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON`
4. Update in Cloudflare Pages dashboard (Production + Preview)

### ElevenLabs API Key
1. Delete at https://elevenlabs.io/app/settings/api-keys
2. Create a new key
3. `wrangler secret put ELEVENLABS_API_KEY`

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

## 12. Reporting Vulnerabilities

If you discover a security vulnerability in missiAI, please report it
responsibly:

- **Email:** security@missi.space
- **GitHub:** Open a private security advisory at
  [github.com/rudrasatani13/missiAI/security/advisories](https://github.com/rudrasatani13/missiAI/security/advisories)

Do not open public issues for security vulnerabilities. We will acknowledge
receipt within 48 hours and provide a fix timeline within 7 days.
