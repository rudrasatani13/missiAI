# missiAI - PRD & Progress

## Original Problem Statement
Login page on live site (https://missi.space/login) returns 500 Internal Server Error when deployed on Cloudflare Pages, but works fine on localhost.

## Architecture
- **Framework**: Next.js 16.1.6 (App Router)
- **Auth**: Clerk (@clerk/nextjs ^6.39.0)
- **Deployment**: Cloudflare Pages via @cloudflare/next-on-pages
- **AI**: Gemini 2.5 Flash (voice + chat)
- **Storage**: Cloudflare KV (MISSI_MEMORY)

## Root Cause Analysis
1. **`export const runtime = "edge"` in layout.tsx** — Caused SSR crash on Cloudflare edge runtime. Layouts should NOT have explicit edge runtime when using @cloudflare/next-on-pages (it's already edge by default).
2. **No error resilience in middleware** — When Clerk middleware encountered issues (e.g., missing CLERK_SECRET_KEY, edge crypto incompatibility), public routes like /login crashed with 500 instead of gracefully proceeding.
3. **Redundant `export const runtime = "edge"` on client pages** — Login and sign-up pages had both `"use client"` and `export const runtime = "edge"`, which is redundant and can cause build/runtime issues.

## What's Been Implemented (Jan 2026)
- [x] Removed `export const runtime = "edge"` from `app/layout.tsx`
- [x] Removed `export const runtime = "edge"` from `app/login/[[...sign-in]]/page.tsx`
- [x] Removed `export const runtime = "edge"` from `app/sign-up/[[...sign-up]]/page.tsx`
- [x] Added try-catch error resilience wrapper to `middleware.ts` — public routes proceed even if Clerk crashes
- [x] Middleware now returns proper 503 JSON for API routes if auth service is unavailable
- [x] Protected routes gracefully redirect to /login instead of 500

## Configuration Checklist (User Action Required)
- [ ] Verify `CLERK_SECRET_KEY` is set in Cloudflare Pages dashboard (Settings → Environment Variables)
- [ ] Verify `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set in Cloudflare
- [ ] Redeploy after code changes

## Backlog / Future
- P0: Verify fix resolves 500 on live site after redeploy
- P1: Consider migrating from @cloudflare/next-on-pages to @opennextjs/cloudflare (Cloudflare's recommended approach as of 2025)
- P2: Add monitoring/logging for middleware errors in production
