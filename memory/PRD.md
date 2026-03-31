# Missi AI — PRD & Implementation Log

## Original Problem Statement
Add a full observability layer — structured logging, health checks, error tracking, and cost alerts — to a Next.js Cloudflare Pages AI chatbot project before real users onboard.

## Architecture
- **Runtime**: Cloudflare Pages + Edge runtime (no Node.js process, no file system)
- **Framework**: Next.js 16 with App Router
- **Auth**: Clerk
- **AI**: Google Gemini (2.5-pro / 2.0-flash-lite via model router)
- **TTS**: ElevenLabs
- **Storage**: Cloudflare Workers KV (MISSI_MEMORY binding)
- **Package Manager**: pnpm

## Core Requirements (Static)
1. Structured JSON logging (edge-compatible, Cloudflare Workers Logs)
2. Health check endpoint (GET /api/health) with KV + env validation
3. Cost tracking per request (Gemini tokens + ElevenLabs TTS chars)
4. Daily budget alerts via KV
5. Typed environment variable access
6. Request logging in middleware
7. Observability hooks in all API routes (chat, tts, memory)

## What's Been Implemented (2026-03-31)
- **lib/logger.ts** — LogEvent interface, log(), logRequest(), logError(), createTimer()
- **lib/cost-tracker.ts** — RequestCost interface, COST_CONSTANTS, calculateTotalCost(), DAILY_BUDGET_USD (env-configurable), checkBudgetAlert()
- **lib/env.ts** — getEnv() typed env access, envExists() for health checks
- **app/api/health/route.ts** — GET endpoint, KV connectivity + env presence checks, 200/207/503 status codes
- **middleware.ts** — Extended with structured request logging (api.request, api.rate_limited, api.unauthorized, middleware.error), health route exempted from rate limiting
- **app/api/chat/route.ts** — Timer, cost tracking via calculateTotalCost(), budget alert via checkBudgetAlert(), structured logging for chat.completed/chat.error/chat.stream_error
- **app/api/tts/route.ts** — Logging tts.request with charCount/durationMs, logError on failures
- **app/api/memory/route.ts** — Logging memory.read/memory.write with factCount, logError on failures

## Testing Status
- TypeScript compilation: PASS (only pre-existing waitlist error)
- All observability modules: 100% test pass rate
- Code review: All interfaces, exports, and integrations verified

## Prioritized Backlog
### P0 (Next)
- Wire up daily cost accumulation (aggregate costs per day in KV, pass running total to checkBudgetAlert)
- Add cost tracking to TTS route (ttsChars integration with chat flow)

### P1
- Add alerting webhook (Slack/Discord) when budget.alert fires
- Add /api/health to uptime monitoring (e.g., Better Uptime, Checkly)
- Dashboard UI for cost visualization

### P2
- Per-user cost tracking and quotas
- Distributed rate limiting via KV (replace in-memory Map)
- Error aggregation dashboard
- Performance percentile tracking (p50/p95/p99 response times)
