# missiAI — PRD & Architecture Notes

## Original Problem Statement
Cloudflare Pages deployment failing because the generated Pages Functions bundle size (~28.2 MiB) exceeds the 25 MiB limit.

Build error:
```
Generated Pages Functions bundle size (28234285) is over the limit of 25.0 MiB
Failed: generating Pages Functions failed.
```

## Root Cause
`app/layout.tsx` had `export const runtime = "edge"` and `export const dynamic = "force-dynamic"` at the root layout level. This forced ALL pages (including purely static ones like /terms, /privacy, /manifesto, /pricing, /sign-in, /sign-up, and the homepage) to become edge functions, each bundling ~1.7 MB of dependencies (including @clerk/nextjs).

## Tech Stack
- Next.js 16.1.6
- React 19
- @clerk/nextjs 6.39.0 (auth)
- @cloudflare/next-on-pages 1.13.16
- Cloudflare Pages (Workers)
- Stripe (billing)
- Google Gemini (AI)
- ElevenLabs (TTS/STT)

## Architecture
- Frontend: Next.js App Router, all pages under `/app/`
- Backend: Next.js API routes under `/app/app/api/`
- Database: Cloudflare KV (MISSI_MEMORY) + Cloudflare Vectorize (LIFE_GRAPH)
- Auth: Clerk

## What Was Implemented (Bundle Fix - April 2026)

### Changes Made
1. **`app/layout.tsx`**: Removed `export const runtime = "edge"` and `export const dynamic = "force-dynamic"` from the root layout
   - These were incorrectly forcing ALL 24 pages/routes into edge runtime
   - Only pages with EXPLICIT `runtime = "edge"` should be edge functions

2. **`app/pricing/page.tsx`**: Added `export const dynamic = "force-static"`
   - This page uses `useSearchParams()` which could prevent static generation
   - `force-static` explicitly tells Next.js to pre-render it as static HTML
   - `useSearchParams` returns empty during pre-render but works correctly after client hydration

### Pages that become STATIC (no longer edge functions after fix):
- `/` (homepage) — 1,740 KiB saved
- `/manifesto` — 1,711 KiB saved
- `/pricing` — 1,711 KiB saved
- `/privacy` — 1,707 KiB saved
- `/sign-in` — 1,702 KiB saved
- `/sign-up` — 1,702 KiB saved
- `/terms` — 1,707 KiB saved
- **Total savings: ~11,980 KiB (~11.7 MB)**

### Pages that REMAIN as edge functions (explicit `runtime = "edge"`):
- `/chat` (1,759 KiB) — voice AI interface
- `/memory` (1,770 KiB) — memory graph
- `/admin` (1,713 KiB) — analytics dashboard
- `/waitlist` (1,752 KiB) — uses Clerk server action
- `/_not-found` (1,574 KiB) — 404 handler
- All `/api/v1/*` routes — API handlers (~6,597 KiB)
- Middleware (~298 KiB)
- **Total remaining: ~15,463 KiB (~15.1 MB)**

### Result
- Before: 28.2 MB (over 25 MB limit)
- After: ~15.5 MB (well under 25 MB limit)

## Core Features (App Functionality)
- Voice AI assistant (ElevenLabs STT + Gemini AI + ElevenLabs TTS)
- Persistent memory graph (Cloudflare KV + Vectorize)
- Multi-personality AI modes
- Proactive intelligence / briefings
- Action engine (calendar, notes, etc.)
- Plugin integrations (Notion, Google Calendar, Webhook)
- Billing/subscriptions (Stripe)
- Admin analytics dashboard
- Waitlist management (Clerk)

## Pages Overview
| Route | Runtime | Type |
|-------|---------|------|
| `/` | static | Landing page |
| `/chat` | edge | Voice AI interface |
| `/memory` | edge | Memory graph |
| `/admin` | edge | Analytics |
| `/waitlist` | edge | Waitlist (server action) |
| `/pricing` | static (force-static) | Pricing page |
| `/manifesto` | static | Manifesto |
| `/terms` | static | Terms of service |
| `/privacy` | static | Privacy policy |
| `/sign-in` | static | Clerk sign-in |
| `/sign-up` | static | Clerk sign-up |
| `/_not-found` | edge | 404 handler |
| `/api/v1/*` | edge | API routes |

## Prioritized Backlog
### P0 (Critical)
- [x] Bundle size fix for Cloudflare Pages deployment

### P1 (High)
- None known

### P2 (Nice to have)
- Further bundle optimization if new pages are added
- Consider `serverExternalPackages` additions in next.config.mjs for future heavy deps
