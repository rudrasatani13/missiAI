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
- **lib/billing/dodo-client.ts**: New edge-compatible Dodo Payments client with `getDodoKey`, `createDodoCheckout`, `getDodoSubscription`, `cancelDodoSubscription`, `createDodoCustomerPortal`, `verifyDodoWebhook`, `determinePlanFromProduct`
- **lib/billing/tier-checker.ts**: Updated to use Dodo field names in Clerk metadata
- **app/api/v1/billing/route.ts**: Updated GET/POST/DELETE handlers to use Dodo client
- **app/api/webhooks/dodo/route.ts**: New webhook handler for `subscription.active`, `subscription.updated`, `subscription.cancelled`, `payment.succeeded`
- **middleware.ts**: Public route updated to `/api/webhooks/dodo`
- **app/pricing/page.tsx**: Added payment method badges (UPI, Cards, NetBanking, 150+ countries) and "Powered by Dodo Payments"
- **.env.example**: Replaced STRIPE_ vars with DODO_ vars
- **wrangler.toml**: Updated secrets list
- **tests/lib/billing/dodo-client.test.ts**: New comprehensive test suite
- **tests/lib/billing/tier-checker.test.ts**: Updated to Dodo field names

### Deleted Files
- `lib/billing/stripe-client.ts`
- `app/api/webhooks/stripe/route.ts`
- `tests/lib/billing/stripe-client.test.ts`

## Test Status
- **382/382 tests passing** (30 test files)
- Zero Stripe references in codebase

## Environment Variables Required
- `DODO_API_KEY` — Dodo Payments API key
- `DODO_WEBHOOK_SECRET` — Webhook signing secret
- `DODO_PRO_PRODUCT_ID` — Product ID for Pro plan
- `DODO_BUSINESS_PRODUCT_ID` — Product ID for Business plan

## Backlog
- P0: Configure Dodo Payments dashboard with real API keys and product IDs
- P0: Set up webhook endpoint in Dodo dashboard pointing to `/api/webhooks/dodo`
- P1: End-to-end payment flow testing with real Dodo test keys
- P2: Add subscription management UI (cancel, upgrade/downgrade)
- P2: Add invoice history page
