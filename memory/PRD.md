# missiAI Admin Analytics Dashboard - PRD

## Original Problem Statement
Build an admin analytics dashboard showing platform health, usage metrics, revenue, and cost data for the missiAI voice AI assistant platform.

## Architecture
- **Stack**: Next.js 16 + Cloudflare Workers (edge runtime) + Clerk auth + KV storage
- **No Node.js**: Edge runtime only, no background jobs
- **Model**: gemini-3-flash-preview (unchanged)

## Core Requirements
1. Analytics types (DailyStats, LifetimeTotals, AnalyticsSnapshot, FeatureUsage)
2. KV-backed event store with fire-and-forget recording
3. Aggregator with snapshot caching (5-min TTL)
4. Admin-protected API (ADMIN_USER_ID env var, 403 for unauthorized)
5. Dashboard UI with 6 sections (dark glass style)
6. Analytics events in all main API routes (chat, tts, memory, actions)
7. Middleware protection for /admin routes
8. 29 new unit tests (all passing)

## What's Been Implemented (Jan 2026)
- [x] `types/analytics.ts` - All analytics types + helper constructors
- [x] `lib/analytics/event-store.ts` - recordEvent, getDailyStats, getLifetimeTotals, recordUserSeen, getUniqueUserCount
- [x] `lib/analytics/aggregator.ts` - buildAnalyticsSnapshot, calculateGrowthRate, formatCostUsd
- [x] `app/api/v1/admin/analytics/route.ts` - Admin API with 403 protection, date query support
- [x] `hooks/useAnalytics.ts` - Client-side hook with formatNumber
- [x] `app/admin/page.tsx` - Full dashboard with KPIs, plan breakdown, 7-day trend, cost table, lifetime stats, recent activity
- [x] Updated chat/tts/memory/actions routes with fire-and-forget analytics events
- [x] Updated middleware.ts for /admin route protection
- [x] 29 new tests in tests/lib/analytics/ (event-store + aggregator)
- [x] All 378 tests passing (349 existing + 29 new)

## User Personas
- **Admin**: Platform owner viewing analytics dashboard
- **End Users**: Voice AI users whose interactions are tracked anonymously

## Backlog
- P0: None (all spec items complete)
- P1: Real-time WebSocket updates for dashboard
- P2: Export analytics to CSV/PDF
- P2: Custom date range picker for analytics
- P3: Alert system for budget threshold notifications

## Next Tasks
- Set ADMIN_USER_ID in .env with actual Clerk user ID
- Monitor analytics data accumulation in KV
- Consider adding email alerts for budget thresholds
