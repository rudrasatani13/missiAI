# missiAI — PRD (Product Requirements Document)

## Original Problem Statement
Replace Stripe completely with Dodo Payments in the missiAI application. Same freemium model (Free/$0, Pro/$9, Business/$49), same tier structure, same user experience. Dodo Payments supports India (UPI, cards) + 150+ countries globally.

## Architecture
- **Stack**: Next.js 16 + Cloudflare Workers (edge runtime) + Clerk Auth + KV storage
- **Payment Provider**: Dodo Payments (previously Stripe)
- **AI Model**: gemini-3-flash-preview (unchanged)
- **Deployment**: Cloudflare Pages + Workers

## What's Been Implemented (2026-04-03)

### Stripe → Dodo Payments Migration (Complete)
- **types/billing.ts**: `stripePriceId` → `dodoPriceId`, `stripeCustomerId` → `dodoCustomerId`, `stripeSubscriptionId` → `dodoSubscriptionId`
- **lib/billing/dodo-client.ts**: New edge-compatible Dodo Payments client
- **lib/billing/tier-checker.ts**: Updated to use Dodo field names in Clerk metadata
- **app/api/v1/billing/route.ts**: Updated handlers - now reads product IDs at request time (not module init) for edge runtime compatibility
- **app/api/webhooks/dodo/route.ts**: New webhook handler
- **middleware.ts**: Public route updated to `/api/webhooks/dodo`
- **app/pricing/page.tsx**: Added payment badges, "Powered by Dodo Payments", error message display
- **.env.example & wrangler.toml**: Updated for Dodo vars

### Bug Fixes (2026-04-03)
- **Payment button fix**: Product IDs now read at request time via `process.env` directly in the billing route handler, not from PLANS constant (which evaluates at module load time and may be empty in edge runtime)
- **Error display**: Pricing page now shows billing errors (was silently swallowing them)

## Test Status
- **382/382 tests passing** (30 test files)
- Zero Stripe references in codebase

## Environment Variables Required (Cloudflare)
- `DODO_API_KEY` — Dodo Payments API key
- `DODO_WEBHOOK_SECRET` — Webhook signing secret
- `DODO_PRO_PRODUCT_ID` — Product ID for Pro plan
- `DODO_BUSINESS_PRODUCT_ID` — Product ID for Business plan
- `CLERK_SECRET_KEY` — Clerk auth secret (verify after redeployment!)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — Clerk publishable key

## Known Issue: Login Redirect Loop
- NOT caused by code changes — Clerk middleware and auth pages are unchanged
- Most likely caused by CLERK_SECRET_KEY being missing/expired on Cloudflare after redeployment
- Fix: Verify Clerk keys on Cloudflare dashboard, clear Cloudflare cache

## Backlog
- P0: Verify all Cloudflare secrets after redeployment
- P1: End-to-end payment flow testing with real Dodo test keys
- P2: Add subscription management UI
