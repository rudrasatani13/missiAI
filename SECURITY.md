# Security Runbook — MissiAI Production

This document is the authoritative checklist for deploying MissiAI securely to
production (Cloudflare Pages + Workers KV).

---

## 1. HTTPS Enforcement

HSTS (`Strict-Transport-Security`) headers are already emitted by Next.js
(`next.config.mjs`) on every response:

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

The following platform-level settings must be verified for each deployment.

### Cloudflare Pages (primary platform)

| Setting | Location | Required value |
|---------|----------|---------------|
| Always Use HTTPS | SSL/TLS → Edge Certificates | **On** |
| Minimum TLS Version | SSL/TLS → Edge Certificates | **TLS 1.2** |
| HTTP/2 | Speed → Optimization | **Enabled** |
| Opportunistic Encryption | SSL/TLS → Edge Certificates | **On** |

**Verification:**
```bash
# Must return HTTP 301 → https://
curl -I http://missi.space

# Must include HSTS header
curl -sI https://missi.space | grep -i strict-transport
```

### HSTS Preload List

The `preload` directive is set. Once the site is stable, submit it at
https://hstspreload.org — this tells browsers to **never** connect over HTTP
even on first visit (before a redirect is served).

> ⚠️ Preloading is a one-way commitment. Only submit after confirming all
> subdomains also support HTTPS.

---

## 2. Secrets Management

### Principle

All secrets belong **only** in:
- Cloudflare Pages dashboard → Settings → Environment variables (encrypted)
- `wrangler secret put <NAME>` for Worker secrets
- Local `.env.*.local` files that are **never committed** (listed in `.gitignore`)

**Never** put secrets in:
- `wrangler.toml` `[vars]` section (values are plaintext and committed)
- `next.config.mjs` or any committed file

### Setting secrets via Wrangler CLI

```bash
# Set each secret individually — you will be prompted for the value
wrangler secret put GEMINI_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put ELEVENLABS_VOICE_ID
wrangler secret put CLERK_SECRET_KEY
wrangler secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
wrangler secret put ADMIN_USER_ID
wrangler secret put DODO_PAYMENTS_API_KEY
wrangler secret put DODO_WEBHOOK_SECRET
wrangler secret put DODO_PRO_PRODUCT_ID
wrangler secret put DODO_BUSINESS_PRODUCT_ID
wrangler secret put VAPID_PRIVATE_KEY

# Verify (values are redacted in output)
wrangler secret list
```

### Setting secrets in Cloudflare Pages dashboard

1. Go to **Cloudflare Pages** → select `missiai` project
2. Navigate to **Settings → Environment variables**
3. Click **Add variable** → enter name and value → toggle **Encrypt**
4. Set the same variables for both **Production** and **Preview** environments

---

## 3. Database / KV Access Hardening

Cloudflare Workers KV (`MISSI_MEMORY`) is **not publicly accessible** over the
internet. It is exclusively accessible via the Cloudflare Workers runtime
binding declared in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "MISSI_MEMORY"
id = "ddf2e5eb21484fd1a9aecd8e4eaada74"
```

**Access model:**
- Code accesses KV only via `getRequestContext().env.MISSI_MEMORY`
- There is no HTTP API exposed for KV — the binding is the only access path
- The KV namespace ID in `wrangler.toml` is **not a secret** (it is a resource
  identifier, not a credential)
- Only the Worker deployed with the `MISSI_MEMORY` binding can read/write the
  namespace — no firewall rules needed beyond Cloudflare's standard isolation

**Principle of least privilege:** routes only access KV inside the Worker
runtime; no external services or admin tools have direct KV access.

---

## 4. Key Rotation Procedure (Incident Response)

If a secret is suspected to be compromised:

### Gemini API Key
1. Go to https://aistudio.google.com/apikey → revoke the key immediately
2. Generate a new key
3. `wrangler secret put GEMINI_API_KEY` with the new value
4. Update in Cloudflare Pages dashboard (both Production and Preview)

### ElevenLabs API Key
1. Go to https://elevenlabs.io/app/settings/api-keys → delete the key
2. Create a new key
3. `wrangler secret put ELEVENLABS_API_KEY`

### Dodo Payments API Key
1. Go to https://app.dodopayments.com → Developer → API → revoke key
2. Create a new key
3. `wrangler secret put DODO_PAYMENTS_API_KEY`

### Dodo Webhook Secret
1. Go to Dodo dashboard → Webhooks → regenerate secret
2. `wrangler secret put DODO_WEBHOOK_SECRET`
3. Verify webhook signature validation still works end-to-end

### Clerk Secret Key
1. Go to https://dashboard.clerk.com → API Keys → roll the key
2. `wrangler secret put CLERK_SECRET_KEY`
3. **Note:** Rolling the Clerk key invalidates all existing sessions — users will
   be signed out

### VAPID Private Key
1. Generate a new key pair: `npx web-push generate-vapid-keys`
2. `wrangler secret put VAPID_PRIVATE_KEY` with the new private key
3. Update `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (public key can be committed in `.env.example`)
4. **Note:** Existing push subscriptions will fail until users re-subscribe

---

## 5. Security Headers Verification

```bash
# Verify all expected headers are present
curl -sI https://missi.space | grep -iE \
  "strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy|content-security"
```

Expected output (condensed):
```
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
x-content-type-options: nosniff
referrer-policy: strict-origin-when-cross-origin
permissions-policy: camera=(), microphone=(self), geolocation=(), interest-cohort=()
content-security-policy: frame-ancestors 'none'
```

---

## 6. Secret Scanning in CI

The CI pipeline runs [TruffleHog](https://github.com/trufflesecurity/trufflehog)
on every push to scan for accidentally committed secrets. If a secret pattern is
detected, the build will fail and alert the team before the commit reaches `main`.

See `.github/workflows/ci.yml` for the scanning step configuration.
