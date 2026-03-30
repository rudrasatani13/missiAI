# missiAI - PRD & Progress

## Original Problem Statement
Login page on live site (https://missi.space/login) returns 500 Internal Server Error when deployed on Cloudflare Pages, but works fine on localhost.

## Architecture
- **Framework**: Next.js 16.1.6 (App Router)
- **Auth**: Clerk (@clerk/nextjs ^6.39.0)
- **Deployment**: Cloudflare Pages via @cloudflare/next-on-pages ^1.13.16
- **AI**: Gemini 2.5 Flash (voice + chat)
- **Storage**: Cloudflare KV (MISSI_MEMORY)

## Root Cause Analysis (Iteration 2)
The 500 on `/login` was caused by the **catch-all route `[[...sign-in]]` forcing edge runtime SSR** of Clerk's `<SignIn>` component on Cloudflare Workers. This SSR crashes because Clerk's internal server-rendering logic is incompatible with Cloudflare's edge runtime.

Evidence:
- Homepage (/) loads fine → no edge runtime, static HTML shell + client hydration
- Login (/login) → 500 → catch-all `[[...sign-in]]` = dynamic route = edge SSR = crash
- CLERK_SECRET_KEY is correctly set in Cloudflare (confirmed by user)

## Fix Applied
Switched from `routing="path"` (requires catch-all route + edge SSR) to `routing="hash"` (static page + client-side routing). This eliminates edge SSR entirely.

### Files Changed
| File | Change |
|------|--------|
| `middleware.ts` | Try-catch error resilience wrapper around clerkMiddleware |
| `app/layout.tsx` | Removed `export const runtime = "edge"` |
| `next.config.mjs` | Removed deprecated `eslint.ignoreDuringBuilds` |
| `app/login/page.tsx` | **NEW** — Replaced `[[...sign-in]]/page.tsx` with simple page using `routing="hash"` |
| `app/sign-up/page.tsx` | **NEW** — Replaced `[[...sign-up]]/page.tsx` with simple page using `routing="hash"` |
| `app/login/[[...sign-in]]/` | **DELETED** — catch-all route removed |
| `app/sign-up/[[...sign-up]]/` | **DELETED** — catch-all route removed |

## Backlog / Future
- P1: Consider migrating from @cloudflare/next-on-pages to @opennextjs/cloudflare
- P1: Consider migrating middleware.ts to proxy.ts (Next.js 16 deprecation)
- P2: Add monitoring/logging for middleware errors in production
