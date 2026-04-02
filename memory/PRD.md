# missiAI - Stripe Billing Integration PRD

## Problem Statement
Add Stripe billing with freemium model to missiAI voice assistant. Free daily voice limits, Pro tier unlocks full access. Edge-compatible only (no Node.js Stripe SDK).

## Architecture
- **Stack**: Next.js 16 + Cloudflare Pages + Clerk Auth + KV Storage
- **Stripe Integration**: Raw fetch() to Stripe API (edge-compatible, no npm stripe package)
- **Plan Storage**: Clerk publicMetadata on user objects
- **Usage Tracking**: Cloudflare KV with daily TTL keys
- **Webhook Verification**: HMAC-SHA256 via Web Crypto API (crypto.subtle)

## Pricing Model
| Plan | Price | Voice/Day | Personalities | Memory Facts | API Access |
|------|-------|-----------|---------------|--------------|------------|
| Free | $0 | 10 | 1 | 20 | No |
| Pro | $9/mo | Unlimited | 4 | Unlimited | No |
| Business | $49/mo | Unlimited | 4 | Unlimited | Yes |

## What's Been Implemented (Jan 2026)
1. **types/billing.ts** - PlanId, PlanConfig, PLANS, UserBilling, DailyUsage types
2. **lib/billing/stripe-client.ts** - Edge-compatible Stripe API client (checkout, portal, subscription, webhook verification)
3. **lib/billing/usage-tracker.ts** - KV-based daily voice usage tracking with TTL
4. **lib/billing/tier-checker.ts** - Clerk-based plan management (get/set/billing data)
5. **app/api/v1/billing/route.ts** - GET (plan+usage), POST (checkout), DELETE (portal) API
6. **app/api/webhooks/stripe/route.ts** - Stripe webhook handler (checkout.session.completed, subscription.updated/deleted)
7. **app/api/v1/chat/route.ts** - Voice usage gating + tier-based rate limiting
8. **app/pricing/page.tsx** - Pricing page with 3 plan cards, FAQ, status messages
9. **hooks/useBilling.ts** - Client billing hook (plan, usage, checkout, portal)
10. **components/chat/UsageBar.tsx** - Usage bar for free users at bottom of chat
11. **app/chat/page.tsx** - Integrated UsageBar, Pro upgrade badge, disabled state at limit
12. **middleware.ts** - Added /api/webhooks/stripe and /pricing to public routes
13. **lib/validation/schemas.ts** - Added billingCheckoutSchema
14. **.env.example** - Added Stripe env vars documentation
15. **tests/lib/billing/** - 21 unit tests (usage-tracker, tier-checker, stripe-client)

## Test Results
- **349/349 tests passing** (328 existing + 21 new billing tests)
- 0 regressions

## Prioritized Backlog
### P0 (Required for launch)
- [x] All 15 billing implementation items complete
- [ ] Configure Stripe products & price IDs in Stripe Dashboard
- [ ] Set Stripe secrets via `wrangler secret put`
- [ ] Set up Stripe webhook endpoint in Stripe Dashboard

### P1 (Near-term)
- [ ] Business plan: team features, API access endpoints
- [ ] Subscription renewal/expiry handling (cron job)
- [ ] Email notifications for subscription events

### P2 (Future)
- [ ] Annual billing option (20% discount)
- [ ] Usage analytics dashboard for admins
- [ ] Referral program / promo codes
