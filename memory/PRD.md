# missiAI - PRD & Implementation Log

## Original Problem Statement
Remove all Stripe/Dodo billing code and replace with Razorpay. Razorpay uses a JS popup widget (not page redirect) for checkout. Replace all Dodo Payments integration with Razorpay across types, client library, API routes, webhooks, frontend hooks, pricing page, middleware, validation schemas, and tests.

## Architecture
- **Framework**: Next.js 16 with Edge Runtime (Cloudflare Workers)
- **Auth**: Clerk (publicMetadata stores billing data)
- **Payment**: Razorpay (subscriptions with JS popup checkout widget)
- **KV Store**: Cloudflare KV (MISSI_MEMORY namespace)
- **Testing**: Vitest (30 test files, 384 tests)

## User Personas
- Free tier users (10 voice interactions/day)
- Pro subscribers ($9/mo via Razorpay)
- Business subscribers ($49/mo via Razorpay)

## Core Requirements
- Razorpay subscription billing with popup checkout widget
- HMAC-SHA256 webhook & payment verification (crypto.subtle)
- Edge-runtime compatible (fetch only, no Node.js-specific packages)
- All billing metadata stored in Clerk publicMetadata

## What's Been Implemented (2026-04-03)

### Dodo → Razorpay Migration (Complete)
- **Deleted**: `lib/billing/dodo-client.ts`, `app/api/webhooks/dodo/route.ts`, `tests/lib/billing/dodo-client.test.ts`
- **Created**: `lib/billing/razorpay-client.ts` (8 exported functions)
- **Created**: `app/api/v1/billing/verify/route.ts` (payment verification endpoint)
- **Created**: `app/api/webhooks/razorpay/route.ts` (4 webhook events)
- **Created**: `tests/lib/billing/razorpay-client.test.ts` (13 tests)
- **Updated**: `types/billing.ts` (razorpayPlanId, razorpayCustomerId, razorpaySubscriptionId)
- **Updated**: `lib/billing/tier-checker.ts` (razorpay field references)
- **Updated**: `app/api/v1/billing/route.ts` (Razorpay customer + subscription creation)
- **Updated**: `hooks/useBilling.ts` (initiateRazorpayCheckout with popup widget)
- **Updated**: `app/pricing/page.tsx` (Razorpay branding, payment badges, cancel flow)
- **Updated**: `app/chat/page.tsx` (initiateRazorpayCheckout reference)
- **Updated**: `middleware.ts` (/api/webhooks/razorpay route)
- **Updated**: `lib/validation/billing-schemas.ts` (verifyPaymentSchema)
- **Updated**: `tests/lib/billing/tier-checker.test.ts` (razorpay fields)

### Test Results
- 30 test files, 384 tests all passing
- Zero Dodo/Stripe references remaining in codebase

## Environment Variables Required
```
RAZORPAY_KEY_ID=          # Razorpay Dashboard → Settings → API Keys
RAZORPAY_KEY_SECRET=      # Razorpay Dashboard → Settings → API Keys
RAZORPAY_WEBHOOK_SECRET=  # Razorpay Dashboard → Webhooks → Secret
RAZORPAY_PRO_PLAN_ID=     # Create via Dashboard → Subscriptions → Plans
RAZORPAY_BUSINESS_PLAN_ID= # Create via Dashboard → Subscriptions → Plans
```

## Prioritized Backlog
- **P0**: Add Razorpay API keys to production environment
- **P1**: Configure Razorpay webhook URL in dashboard pointing to `/api/webhooks/razorpay`
- **P1**: Create subscription plans in Razorpay dashboard (Pro $9/mo, Business $49/mo)
- **P2**: Add Razorpay test mode end-to-end testing with real test keys
- **P2**: Add subscription status badges on user profile/settings page

## Next Tasks
1. Configure real Razorpay API keys in production environment
2. Create Razorpay plans in dashboard and set RAZORPAY_PRO_PLAN_ID / RAZORPAY_BUSINESS_PLAN_ID
3. Set up webhook endpoint URL in Razorpay dashboard
4. End-to-end test with Razorpay test mode
