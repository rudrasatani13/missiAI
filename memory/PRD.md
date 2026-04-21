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

## What's Been Implemented

### Session 1 — Bug Fix (28 Fixes)
All 28 bugs from PDF audit fixed: security (timing attacks, plan tampering, data leaks), client-side (SDK errors, race conditions, orphaned subs), server-side (orphan cleanup, status validation, webhook handlers), config (DODO→Razorpay), validation (regex, length limits), error handling (generic client errors, parsed API errors).

### Session 2 — UX Improvements
- Navbar pricing link always visible (Upgrade to Pro / Pro Plan / Business Plan)
- Celebration animation on upgrade (confetti + Crown + welcome text)
- Better pricing page for paid users (Current Plan badge, manage options)
- Razorpay customer creation fix (empty contact/gstin)

### Session 3 — Referral System
**Features:**
- Referrer gets 7 extra free days when referred friend upgrades
- New user gets 20% off (6 days free via delayed Razorpay subscription start)
- Max 5 referrals per user
- Link format: `missi.space/?ref=CODE`
- Referral section in pricing/manage plan page with stats
- Auto-capture ?ref= on landing page and pricing page

**Files Created:**
- `/app/lib/billing/referral.ts` — Core referral logic (KV-backed)
- `/app/app/api/v1/referral/route.ts` — GET/POST API endpoints
- `/app/hooks/useReferral.ts` — Client hook
- `/app/components/ui/CelebrationOverlay.tsx` — Upgrade celebration

**Files Modified:**
- `/app/app/pricing/page.tsx` — Referral section, discount banner, stats
- `/app/app/page.tsx` — Referral capture on landing
- `/app/app/api/v1/billing/route.ts` — Referral discount on checkout
- `/app/app/api/v1/billing/verify/route.ts` — Referral reward on verification
- `/app/lib/billing/razorpay-client.ts` — startAt parameter support

## KV Storage Keys (Referral)
- `referral:user:{userId}` → ReferralData JSON
- `referral:code:{code}` → userId (reverse lookup)
- `referral:referred-by:{newUserId}` → referrerUserId

## Backlog / Future
- P1: Subscription status sync cron job
- P1: Email notifications for payment events
- P2: Billing analytics admin dashboard
- P2: Referral sharing via WhatsApp/Twitter buttons
