# missiAI - PRD & Implementation Log

## Overview
missiAI is an AI voice companion application built with Next.js 15, Clerk authentication, Cloudflare KV storage, Dodo billing integration, and Gemini voice/chat via Vertex AI.

## Architecture
- **Frontend**: Next.js 15 (React, TypeScript)
- **Auth**: Clerk
- **Storage**: Cloudflare KV (`MISSI_MEMORY`) + Cloudflare Vectorize (`LIFE_GRAPH`)
- **Billing**: Dodo Payments (Plus & Pro subscriptions)
- **Deployment**: OpenNext Cloudflare + custom worker entry
- **AI**: Gemini via Vertex AI (chat, STT, TTS, Gemini Live)

## What's Been Implemented

### Session 1 — Bug Fix (28 Fixes)
All 28 bugs from PDF audit fixed: security (timing attacks, plan tampering, data leaks), client-side (SDK errors, race conditions, orphaned subs), server-side (orphan cleanup, status validation, webhook handlers), config (legacy billing/provider drift), validation (regex, length limits), error handling (generic client errors, parsed API errors).

### Session 2 — UX Improvements
- Navbar pricing link always visible (Upgrade to Plus / Pro / current plan management)
- Celebration animation on upgrade (confetti + Crown + welcome text)
- Better pricing page for paid users (Current Plan badge, manage options)
- Dodo checkout/customer creation fix

### Session 3 — Referral System
**Features:**
- Referrer gets 7 extra free days when referred friend upgrades
- New user gets 20% off on upgrade via the billing checkout flow
- Max 5 referrals per user
- Link format: `missi.space/?ref=CODE`
- Referral section in pricing/manage plan page with stats
- Auto-capture ?ref= on landing page and pricing page

**Files Created:**
- `/lib/billing/referral.ts` — Core referral logic (KV-backed)
- `/app/api/v1/referral/route.ts` — GET/POST API endpoints
- `/hooks/billing/useReferral.ts` — Client hook
- `/components/feedback/CelebrationOverlay.tsx` — Upgrade celebration

**Files Modified:**
- `/app/pricing/page.tsx` — Referral section, discount banner, stats
- `/app/page.tsx` — Referral capture on landing
- `/app/api/v1/billing/route.ts` — Referral-aware checkout entrypoint
- `/lib/server/routes/billing/runner.ts` — Dodo checkout orchestration with referral discount propagation
- `/lib/server/routes/referral/runner.ts` — Referral summary and tracking orchestration

## KV Storage Keys (Referral)
- `referral:user:{userId}` → ReferralData JSON
- `referral:code:{code}` → userId (reverse lookup)
- `referral:referred-by:{newUserId}` → referrerUserId

## Backlog / Future
- P1: Subscription status sync cron job
- P1: Email notifications for payment events
- P2: Billing analytics admin dashboard
- P2: Referral sharing via WhatsApp/Twitter buttons
