# Security Runbook — missiAI Production

This document is the authoritative security checklist for deploying and operating
missiAI in production on Cloudflare (OpenNext runtime + Workers KV).

**Domain:** [missi.space](https://missi.space)

---

## 1. Authentication & Authorization

### Clerk Middleware

All non-public routes are protected by Clerk middleware (`middleware.ts`).

**Public routes** (no auth required):
- `/` (redirects to /chat)
- `/sign-in`, `/sign-up`
- `/privacy`, `/terms`
- `/api/health`
- `/api/v1/guest-chat` (rate limited, no auth)

**Protected routes** (Clerk session required):
- `/chat`, `/settings`
- All `/api/v1/*` endpoints (except `/api/v1/guest-chat`)

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

### Deployment Artifact Safety

The local `service-account.json` file is a **developer convenience only** and
must **never** be deployed or committed.

| Mechanism | File | What it guards |
|-----------|------|----------------|
| `.gitignore` line 65 | `service-account*.json` | Prevents commit to git |
| `.wranglerignore` | `service-account*.json` | Prevents inclusion in `wrangler deploy` static-asset upload |
| CI checkout | — | Git checkout never contains gitignored files; no CI risk |

The production credential is **always** injected as a Wrangler secret:

```bash
# Inline the JSON (single line, no newlines) as a Wrangler secret:
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
# Paste the minified JSON content at the prompt — never paste a file path.
```

**Verification (before every local deploy):**
```bash
# Confirm the file is gitignored
git check-ignore -v service-account.json
# Expected: .gitignore:65:service-account*.json  service-account.json

# Confirm it is not staged or tracked
git ls-files service-account.json
# Expected: (empty output)
```

If either check fails, **stop and rotate the service account key immediately**
before pushing or deploying anything.

### Required Secrets & Protected Runtime Values

```bash
# AI & Voice
wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON

# Authentication
wrangler secret put CLERK_SECRET_KEY
wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY

# KV encryption
wrangler secret put MISSI_KV_ENCRYPTION_SECRET

# Verify (values are redacted in output)
wrangler secret list
```

Also set `VERTEX_AI_PROJECT_ID` as a runtime environment variable. `VERTEX_AI_LOCATION` is optional and defaults to `us-central1`.

### Runtime behavior

- `MISSI_KV_ENCRYPTION_SECRET` is required in production for KV encryption and live relay tickets.
- Missing or empty `MISSI_KV_ENCRYPTION_SECRET` now fails closed with a 503 on routes that need it.
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

### Data Isolation

All user data is keyed by Clerk user ID. API routes extract the authenticated
user ID from the Clerk session and scope all KV operations to that ID.
There is no cross-user data access path.

---

## 5. Input Validation & Sanitization

### API Input Validation

All API request bodies are validated using **Zod schemas** (`lib/validation/schemas.ts`).
Invalid payloads are rejected with 400 responses before reaching business logic.

**Additional guards:**
- Payload size limits on all POST endpoints
- Maximum input length enforced on chat messages

---

## 6. Rate Limiting

missiAI uses **dual-layer rate limiting**:

1. **IP-based burst guard** — in-memory, applied in middleware to all API routes.
   Prevents rapid-fire requests from a single IP.
   - This is per-isolate on Cloudflare Workers and does not provide global distributed protection.
   - Add Cloudflare WAF / Rate Limiting rules for distributed abuse.

2. **Per-user KV-backed limits** — applied in route handlers. Tracks usage per
   authenticated Clerk user ID with configurable windows and thresholds.

---

## 7. Security Headers

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

## 8. Key Rotation Procedure (Incident Response)

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

**Rotation steps:**
1. `openssl rand -base64 32` → copy the 44-char result
2. `wrangler secret put MISSI_KV_ENCRYPTION_SECRET`
3. Update in Cloudflare dashboard environment settings (Production + Preview)
4. **Impact:** Existing live relay tickets signed with the old secret will stop validating (users retry; no data loss).

### Clerk Secret Key
1. Roll at https://dashboard.clerk.com > API Keys
2. `wrangler secret put CLERK_SECRET_KEY`
3. **Impact:** All existing sessions are invalidated — users will be signed out

---

## 9. Secret Scanning in CI

The CI pipeline runs [TruffleHog](https://github.com/trufflesecurity/trufflehog)
on every push to scan for accidentally committed secrets. If a secret pattern is
detected, the build fails and alerts the team before the commit reaches `main`.

See `.github/workflows/ci.yml` for the scanning step configuration.

---

## 10. Reporting Vulnerabilities

If you discover a security vulnerability in missiAI, please report it
responsibly:

- **Email:** security@missi.space
- **GitHub:** Open a private security advisory at
  [github.com/rudrasatani13/missiAI/security/advisories](https://github.com/rudrasatani13/missiAI/security/advisories)

Do not open public issues for security vulnerabilities. We will acknowledge
receipt within 48 hours and provide a fix timeline within 7 days.
