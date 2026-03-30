# missiAI - PRD & Progress

## Original Problem Statement
Login page on live site (https://missi.space/login) returns 500 Internal Server Error when deployed on Cloudflare Pages, but works fine on localhost.

## Architecture
- **Framework**: Next.js 16.1.6 (App Router)
- **Auth**: Clerk (@clerk/nextjs ^6.39.0)
- **Deployment**: Cloudflare Pages via @cloudflare/next-on-pages ^1.13.16
- **AI**: Gemini 2.5 Flash (voice + chat)
- **Storage**: Cloudflare KV (MISSI_MEMORY)

## Root Cause Analysis
The 500 error on `/login` was caused by **Clerk middleware crashing in Cloudflare's edge runtime** without graceful error handling. Key evidence:
- `X-Clerk-Auth-Reason: session-token-and-uat-missing` (Clerk headers present = middleware ran partially)
- `X-Matched-Path: /500` (Next.js matched to error page)
- Works on localhost (has .env.local with CLERK_SECRET_KEY) but not on Cloudflare (may be missing CLERK_SECRET_KEY)

Contributing factors:
1. `export const runtime = "edge"` on `layout.tsx` — layouts shouldn't need this with @cloudflare/next-on-pages
2. No try-catch around `clerkMiddleware` — one crash = 500 on ALL routes
3. Deprecated `eslint` config in `next.config.mjs` (Next.js 16 warning)
4. Possibly missing `CLERK_SECRET_KEY` in Cloudflare Pages environment variables

## What's Been Implemented (Jan 2026)
- [x] **middleware.ts**: Added try-catch error resilience wrapper around `clerkMiddleware` — public routes proceed even if Clerk fails, API routes get 503 JSON, protected routes redirect to /login
- [x] **layout.tsx**: Removed `export const runtime = "edge"` (not required for layouts, was NOT flagged in build)
- [x] **login/page.tsx & sign-up/page.tsx**: Kept `export const runtime = "edge"` (REQUIRED by @cloudflare/next-on-pages for dynamic catch-all routes)
- [x] **next.config.mjs**: Removed deprecated `eslint.ignoreDuringBuilds` (unsupported in Next.js 16)

## Configuration Checklist (User Action Required)
- [ ] Verify `CLERK_SECRET_KEY` is set in Cloudflare Pages dashboard (Settings → Environment Variables → Production & Preview)
- [ ] Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set in Cloudflare
- [ ] Redeploy after code changes

## Backlog / Future
- P0: Verify fix resolves 500 on live site after redeploy
- P1: Consider migrating from @cloudflare/next-on-pages to @opennextjs/cloudflare (Cloudflare's recommended approach for Next.js 16+)
- P1: Consider migrating middleware.ts to proxy.ts (Next.js 16 deprecation)
- P2: Add monitoring/logging for middleware errors in production
