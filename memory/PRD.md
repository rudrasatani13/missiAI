# missiAI - PRD & Implementation Log

## Overview
missiAI is an AI voice companion application built with Next.js 16, Clerk authentication, Cloudflare KV storage, and Razorpay billing integration.

## Architecture
- **Frontend**: Next.js 16 (React, TypeScript)
- **Auth**: Clerk
- **Storage**: Cloudflare KV (MISSI_MEMORY namespace)
- **Billing**: Razorpay (subscriptions)
- **Deployment**: Cloudflare Workers/Pages
- **AI**: Gemini API, ElevenLabs (voice)

## What's Been Implemented (Jan 2026)

### Bug Fix Session - 28 Fixes Applied

**CRITICAL BUGS (P0):**
1. BUG-1: Removed `process.env` from shared `types/billing.ts` — added `getServerRazorpayPlanId()` server-only helper
2. BUG-2: Removed contradictory `force-static` from client component `pricing/page.tsx`
3. BUG-3: Removed `razorpayCustomerId` from POST `/api/v1/billing` response

**SECURITY VULNERABILITIES (P0):**
4. SEC-1: Replaced `===` with constant-time `timingSafeCompare()` for HMAC signature verification
5. SEC-2: Verify endpoint now derives plan from Razorpay subscription's `plan_id`, not client-sent value
6. SEC-3: Added rate limiting to payment verify endpoint
7. SEC-4: Server count is now source of truth — removed `Math.max` localStorage merge
8. SEC-5: Webhook now logs and returns 401 for invalid/missing signatures
9. SEC-6: Added webhook event idempotency via KV store
10. SEC-7: Stripped `razorpaySubscriptionId` from GET billing response

**CLIENT-SIDE BUGS (P1):**
11. CLI-1: Specific error feedback when Razorpay SDK fails to load
12. CLI-2: Added `isCancelling` loading state for subscription cancellation
13. CLI-3: Replaced `window.confirm()` with custom CancelModal component
14. CLI-4: ondismiss handler now cleans up orphaned subscriptions
15. CLI-5: Added mountedRef to prevent state updates after component unmount
16. CLI-6: Razorpay checkout now prefills user name/email from Clerk

**SERVER-SIDE BUGS (P1):**
17. SRV-1: Checkout now cancels Razorpay subscription if Clerk metadata save fails
18. SRV-2: `determinePlanFromRazorpayPlan` defaults to 'free' for unknown plans
19. SRV-3: Verify endpoint validates subscription status ('active'/'authenticated')
20. SRV-4: Added `subscription.halted` and `payment.failed` webhook handlers
21. SRV-5: Cancel endpoint updates `cancelAtPeriodEnd` in Clerk metadata

**CLEANUP & CONFIGURATION (P2):**
22. CFG-1: Replaced stale DODO references with Razorpay in `wrangler.toml`
23. CFG-2: Added all Razorpay env vars to `AppEnv` interface in `env.ts`
24. CFG-3: `setUserPlan` now stores `cancelAtPeriodEnd` in Clerk metadata

**VALIDATION & INPUT SANITIZATION (P1):**
25. VAL-1: Added regex format validation for Razorpay IDs (pay_, sub_, hex sig)
26. VAL-2: Added max length limits on all billing schema fields

**ERROR HANDLING (P1):**
27. ERR-1: Error responses no longer leak internal Razorpay details to client
28. ERR-2: Added `parseRazorpayError()` to parse and log Razorpay API error bodies

## Files Modified
- `/app/types/billing.ts`
- `/app/hooks/useBilling.ts`
- `/app/app/pricing/page.tsx`
- `/app/app/api/v1/billing/route.ts`
- `/app/app/api/v1/billing/verify/route.ts`
- `/app/app/api/webhooks/razorpay/route.ts`
- `/app/lib/billing/razorpay-client.ts`
- `/app/lib/billing/tier-checker.ts`
- `/app/lib/server/env.ts`
- `/app/lib/validation/billing-schemas.ts`
- `/app/wrangler.toml`

## Backlog / Future
- P0: Add webhook signature verification integration tests
- P1: Implement proper subscription cancellation flow with grace period
- P1: Add Razorpay subscription status sync cron job
- P2: Add billing analytics dashboard for admin
- P2: Add email notifications for payment events
