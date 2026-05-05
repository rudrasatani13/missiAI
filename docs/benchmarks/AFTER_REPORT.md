# Baseline Report

Generated: 2026-05-02T11:53:47.078Z
Run ID: baseline-bench-2026-05-02T11-51-22-190Z
Selected features: public-marketing, auth-onboarding, chat-core, voice-live, memory-core, visual-memory-life-story, spaces, budget, billing-referrals, quests-streaks, sleep-wind-down, plugins-integrations, messaging-bots, profile-notifications, mood, admin-observability
Baseline mode: yes
Base URL: http://127.0.0.1:3000

## Summary
- Completed: 64
- Skipped: 71
- Failed: 0
- Duration: 144.888 s

## Risk Labels
- P0 = critical performance issue
- P1 = high-impact optimization
- P2 = medium improvement
- P3 = nice-to-have

## Results

| Feature | Benchmark Type | Route/API/Function | p50 | p75 | p95 | Avg | Min | Max | Memory | Bundle Impact | Risk | Status | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Public Marketing and Legal | Http Route Latency | http://127.0.0.1:3000/ | 3.389 | 3.697 | 3.898 | 3.440 | 2.744 | 3.898 | ΔRSS 0 B / peak 117 MB | n/a | P3 | completed | — |
| Public Marketing and Legal | Http Route Latency | http://127.0.0.1:3000/manifesto | 2.814 | 3.025 | 5.045 | 3.049 | 2.456 | 5.045 | ΔRSS -13549568 B / peak 117 MB | n/a | P3 | completed | — |
| Public Marketing and Legal | Http Route Latency | http://127.0.0.1:3000/privacy | 2.719 | 3.251 | 4.956 | 3.130 | 2.539 | 4.956 | ΔRSS -25051136 B / peak 102 MB | n/a | P3 | completed | — |
| Public Marketing and Legal | Http Route Latency | http://127.0.0.1:3000/terms | 2.574 | 2.783 | 3.116 | 2.652 | 2.428 | 3.116 | ΔRSS 0 B / peak 78 MB | n/a | P3 | completed | — |
| Auth, Setup, and Middleware Security | Http Route Latency | http://127.0.0.1:3000/sign-in | 2.206 | 2.281 | 2.745 | 2.265 | 2.093 | 2.745 | ΔRSS 0 B / peak 78 MB | n/a | P0 | completed | — |
| Auth, Setup, and Middleware Security | Http Route Latency | http://127.0.0.1:3000/sign-up | 2.247 | 2.365 | 2.541 | 2.268 | 2.102 | 2.541 | ΔRSS 0 B / peak 78 MB | n/a | P0 | completed | — |
| Auth, Setup, and Middleware Security | Http Route Latency | http://127.0.0.1:3000/setup | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Auth, Setup, and Middleware Security | Server Function Benchmark | lib/setup/setup-completion.ts#hasCompletedSetupLocally | 0.001 | 0.001 | 0.001 | 0.001 | 0.001 | 0.001 | ΔRSS 0 B / peak 104 MB | n/a | P0 | completed | Local setup completion helper benchmarked in the Node runtime; it should return false when window is unavailable. |
| Chat Core and SSE Streaming | Http Route Latency | http://127.0.0.1:3000/chat | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | Api Latency | http://127.0.0.1:3000/api/v1/chat | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Use mock provider fixtures for LLM latency baselines. \| Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | Api Latency | http://127.0.0.1:3000/api/v1/chat-stream | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | Mocked Integration Benchmark | lib/server/chat/route-preflight.ts#runChatRoutePreflight | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Exercise auth, rate-limit, and payload validation without calling providers. \| Fixture module not found yet: benchmarks/fixtures/chat/route-preflight.fixture.ts |
| Chat Core and SSE Streaming | Mocked Integration Benchmark | lib/server/chat/stream-preflight.ts#runChatStreamPreflight | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Fixture module not found yet: benchmarks/fixtures/chat/stream-preflight.fixture.ts |
| Voice, STT, TTS, and Live Relay | Api Latency | http://127.0.0.1:3000/api/v1/live-token | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | Api Latency | http://127.0.0.1:3000/api/v1/stt | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | Api Latency | http://127.0.0.1:3000/api/v1/tts | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | Mocked Integration Benchmark | lib/ai/live/transport.ts#getLiveTransportSession | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Fixture module not found yet: benchmarks/fixtures/voice/live-transport.fixture.ts |
| Memory Dashboard and Life Graph | Http Route Latency | http://127.0.0.1:3000/memory | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Memory Dashboard and Life Graph | Http Route Latency | http://127.0.0.1:3000/memory/graph | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Memory Dashboard and Life Graph | Api Latency | http://127.0.0.1:3000/api/v1/memory | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Memory Dashboard and Life Graph | Server Function Benchmark | lib/memory/life-graph.ts#formatLifeGraphForPrompt | 0.002 | 0.003 | 0.004 | 0.002 | 0.001 | 0.004 | ΔRSS 48 KB / peak 103 MB | n/a | P0 | completed | — |
| Memory Dashboard and Life Graph | Mocked Integration Benchmark | lib/memory/graph-extractor.ts#extractLifeNodes | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Fixture module not found yet: benchmarks/fixtures/memory/graph-extractor.fixture.ts |
| Visual Memory and Life Story | Http Route Latency | http://127.0.0.1:3000/memory/visual | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Visual Memory and Life Story | Http Route Latency | http://127.0.0.1:3000/memory/story | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Visual Memory and Life Story | Api Latency | http://127.0.0.1:3000/api/v1/visual-memory/entries | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Use a concrete sub-path when the fixture suite is added. \| Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Visual Memory and Life Story | Api Latency | http://127.0.0.1:3000/api/v1/life-story/summary | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Catch-all route expects a concrete sub-path in fixtures. \| Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Visual Memory and Life Story | Server Function Benchmark | lib/visual-memory/image-analyzer.ts#mapExtractionToLifeNode | 0.002 | 0.003 | 0.007 | 0.003 | 0.001 | 0.007 | ΔRSS 32 KB / peak 103 MB | n/a | P1 | completed | — |
| Spaces Collaboration | Http Route Latency | http://127.0.0.1:3000/spaces | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Spaces Collaboration | Http Route Latency | http://127.0.0.1:3000/join/fake-token | 6.668 | 7.161 | 8.538 | 6.898 | 5.900 | 8.538 | ΔRSS -212992 B / peak 78 MB | n/a | P1 | completed | — |
| Spaces Collaboration | Api Latency | http://127.0.0.1:3000/api/v1/spaces | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Spaces Collaboration | Api Latency | http://127.0.0.1:3000/api/v1/spaces/fixture-space | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Spaces Collaboration | Server Function Benchmark | lib/spaces/space-store.ts#roleForUser | 0.001 | 0.001 | 0.001 | 0.001 | 0.000 | 0.001 | ΔRSS 32 KB / peak 108 MB | n/a | P1 | completed | — |
| Budget Tracking | Http Route Latency | http://127.0.0.1:3000/budget | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Budget Tracking | Api Latency | http://127.0.0.1:3000/api/v1/budget/entries | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Budget Tracking | Api Latency | http://127.0.0.1:3000/api/v1/budget/insight | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Budget Tracking | Mocked Integration Benchmark | lib/budget/budget-store.ts#buildMonthlyTotals | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Fixture module not found yet: benchmarks/fixtures/budget/monthly-totals.fixture.ts |
| Billing, Pricing, and Referrals | Http Route Latency | http://127.0.0.1:3000/pricing | 2.591 | 2.699 | 4.212 | 2.800 | 2.474 | 4.212 | ΔRSS 0 B / peak 78 MB | n/a | P0 | completed | — |
| Billing, Pricing, and Referrals | Api Latency | http://127.0.0.1:3000/api/v1/billing | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Billing, Pricing, and Referrals | Api Latency | http://127.0.0.1:3000/api/v1/referral | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Billing, Pricing, and Referrals | Api Latency | http://127.0.0.1:3000/api/webhooks/dodo | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Target marked as provider-backed. Re-run with fixture support or --allow-external-calls. |
| Billing, Pricing, and Referrals | Mocked Integration Benchmark | lib/billing/referral.ts#trackReferral | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Fixture module not found yet: benchmarks/fixtures/billing/referral.fixture.ts |
| Quests and Streaks | Http Route Latency | http://127.0.0.1:3000/quests | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Quests and Streaks | Http Route Latency | http://127.0.0.1:3000/streak | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Quests and Streaks | Api Latency | http://127.0.0.1:3000/api/v1/quests | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Quests and Streaks | Api Latency | http://127.0.0.1:3000/api/v1/streak | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Quests and Streaks | Server Function Benchmark | lib/quests/quest-generator.ts#sanitizeQuestText | 0.005 | 0.010 | 0.016 | 0.007 | 0.003 | 0.016 | ΔRSS 64 KB / peak 111 MB | n/a | P2 | completed | — |
| Sleep Sessions and Wind Down | Http Route Latency | http://127.0.0.1:3000/wind-down | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Sleep Sessions and Wind Down | Api Latency | http://127.0.0.1:3000/api/v1/wind-down | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Sleep Sessions and Wind Down | Api Latency | http://127.0.0.1:3000/api/v1/sleep-sessions/list | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Catch-all route expects a concrete sub-path in fixtures. \| Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Sleep Sessions and Wind Down | Server Function Benchmark | lib/sleep-sessions/story-generator.ts#sanitizeStoryText | 0.004 | 0.005 | 0.006 | 0.004 | 0.002 | 0.006 | ΔRSS 16 KB / peak 111 MB | n/a | P2 | completed | — |
| Plugins and Productivity Integrations | Http Route Latency | http://127.0.0.1:3000/settings/integrations | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Plugins and Productivity Integrations | Api Latency | http://127.0.0.1:3000/api/v1/plugins | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Plugins and Productivity Integrations | Api Latency | http://127.0.0.1:3000 | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Plugins and Productivity Integrations | Mocked Integration Benchmark | lib/plugins/plugin-executor.ts#buildPluginCommand | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Fixture module not found yet: benchmarks/fixtures/plugins/plugin-command.fixture.ts |
| Messaging Bots and Public Webhooks | Api Latency | http://127.0.0.1:3000/api/v1/bot/link/whatsapp | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Messaging Bots and Public Webhooks | Api Latency | http://127.0.0.1:3000/api/webhooks/telegram | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Target marked as provider-backed. Re-run with fixture support or --allow-external-calls. |
| Messaging Bots and Public Webhooks | Api Latency | http://127.0.0.1:3000/api/webhooks/whatsapp | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Target marked as provider-backed. Re-run with fixture support or --allow-external-calls. |
| Messaging Bots and Public Webhooks | Mocked Integration Benchmark | lib/bot/bot-pipeline.ts#processBotMessage | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Fixture module not found yet: benchmarks/fixtures/bots/bot-pipeline.fixture.ts |
| Profile Card, Settings, Notifications, and Push | Http Route Latency | http://127.0.0.1:3000/profile | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Profile Card, Settings, Notifications, and Push | Http Route Latency | http://127.0.0.1:3000/settings | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Profile Card, Settings, Notifications, and Push | Api Latency | http://127.0.0.1:3000/api/v1/profile/card | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Profile Card, Settings, Notifications, and Push | Api Latency | http://127.0.0.1:3000/api/v1/notification-prefs | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Mood Timeline | Http Route Latency | http://127.0.0.1:3000/mood | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Mood Timeline | Api Latency | http://127.0.0.1:3000/api/v1/mood/timeline | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Mood Timeline | Mocked Integration Benchmark | lib/mood/mood-analyzer.ts#analyzeMoodFromConversation | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Fixture module not found yet: benchmarks/fixtures/mood/mood-analyzer.fixture.ts |
| Admin, Health, Analytics, and Observability | Http Route Latency | http://127.0.0.1:3000/admin | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Admin, Health, Analytics, and Observability | Api Latency | http://127.0.0.1:3000/api/v1/health | 2.021 | 2.115 | 2.297 | 1.999 | 1.729 | 2.297 | ΔRSS 0 B / peak 78 MB | n/a | P1 | completed | — |
| Admin, Health, Analytics, and Observability | Api Latency | http://127.0.0.1:3000/api/v1/admin/analytics | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Admin, Health, Analytics, and Observability | Server Function Benchmark | lib/analytics/aggregator.ts#calculateGrowthRate | 0.000 | 0.000 | 0.001 | 0.000 | 0.000 | 0.001 | ΔRSS 32 KB / peak 112 MB | n/a | P1 | completed | — |
| Admin, Health, Analytics, and Observability | Mocked Integration Benchmark | lib/analytics/aggregator.ts#buildAnalyticsSnapshot | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Fixture module not found yet: benchmarks/fixtures/admin/analytics-snapshot.fixture.ts |
| Workspace Build Pipeline | Build Time | pnpm run build | 85188.000 | 85188.000 | 85188.000 | 85188.000 | 85188.000 | 85188.000 | n/a | chunks 0 B, build 1.05 GB | P0 | completed | Build completed successfully. \| warn - If this is content and not a class, replace it with `ease-&lsqb;cubic-bezier(0.22,1,0.36,1)&rsqb;` to silence this warning.   ⚠ The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config |
| Workspace Build Pipeline | Build Time | pnpm run build:cf | 56006.000 | 56006.000 | 56006.000 | 56006.000 | 56006.000 | 56006.000 | n/a | chunks 0 B, build 1.11 GB | P0 | completed | Build completed successfully. \| .open-next/server-functions/default/.next/server/chunks/7284.js:1:147834:       1 │ ...1:return em(a,2790,2799,!0,d);case 22:return em(a,2662,2671,!0,d...         ╵                                  ~~~~ |
| Public Marketing and Legal | Bundle Size | /, /manifesto, /privacy, /terms | — | — | — | — | — | — | n/a | chunks 659 KB, build 1.11 GB | P3 | completed | Missing route manifest keys: /privacy/page, /terms/page |
| Auth, Setup, and Middleware Security | Bundle Size | /sign-in, /sign-up, /setup | — | — | — | — | — | — | n/a | chunks 447 KB, build 1.11 GB | P0 | completed | Missing route manifest keys: /sign-in/page, /sign-up/page |
| Chat Core and SSE Streaming | Bundle Size | /chat, /api/v1/chat, /api/v1/chat-stream | — | — | — | — | — | — | n/a | chunks 1.06 MB, build 1.11 GB | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Bundle Size | /chat, /api/v1/live-token, /api/v1/stt, /api/v1/tts | — | — | — | — | — | — | n/a | chunks 1.06 MB, build 1.11 GB | P0 | completed | — |
| Memory Dashboard and Life Graph | Bundle Size | /memory, /memory/graph, /api/v1/memory | — | — | — | — | — | — | n/a | chunks 1.01 MB, build 1.11 GB | P0 | completed | — |
| Visual Memory and Life Story | Bundle Size | /memory/visual, /memory/story, /api/v1/visual-memory/[[...path]], /api/v1/life-story/[...path] | — | — | — | — | — | — | n/a | chunks 1.07 MB, build 1.11 GB | P1 | completed | — |
| Spaces Collaboration | Bundle Size | /spaces, /spaces/[spaceId], /join/[token], /api/v1/spaces, /api/v1/spaces/[spaceId] | — | — | — | — | — | — | n/a | chunks 905 KB, build 1.11 GB | P1 | completed | — |
| Budget Tracking | Bundle Size | /budget, /api/v1/budget/entries, /api/v1/budget/insight | — | — | — | — | — | — | n/a | chunks 1.04 MB, build 1.11 GB | P1 | completed | — |
| Billing, Pricing, and Referrals | Bundle Size | /pricing, /api/v1/billing, /api/v1/referral, /api/webhooks/dodo | — | — | — | — | — | — | n/a | chunks 1022 KB, build 1.11 GB | P0 | completed | — |
| Quests and Streaks | Bundle Size | /quests, /streak, /api/v1/quests, /api/v1/streak | — | — | — | — | — | — | n/a | chunks 1.05 MB, build 1.11 GB | P2 | completed | — |
| Sleep Sessions and Wind Down | Bundle Size | /wind-down, /api/v1/wind-down, /api/v1/sleep-sessions/[...path] | — | — | — | — | — | — | n/a | chunks 896 KB, build 1.11 GB | P2 | completed | — |
| Plugins and Productivity Integrations | Bundle Size | /settings/integrations, /api/v1/plugins/[[...path]] | — | — | — | — | — | — | n/a | chunks 881 KB, build 1.11 GB | P1 | completed | — |
| Messaging Bots and Public Webhooks | Bundle Size | /settings/integrations, /profile, /api/v1/bot/link/whatsapp, /api/webhooks/telegram, /api/webhooks/whatsapp | — | — | — | — | — | — | n/a | chunks 1.02 MB, build 1.11 GB | P1 | completed | — |
| Profile Card, Settings, Notifications, and Push | Bundle Size | /profile, /settings, /api/v1/profile/card, /api/v1/notification-prefs | — | — | — | — | — | — | n/a | chunks 1.05 MB, build 1.11 GB | P2 | completed | — |
| Mood Timeline | Bundle Size | /mood, /api/v1/mood/timeline | — | — | — | — | — | — | n/a | chunks 1017 KB, build 1.11 GB | P2 | completed | — |
| Admin, Health, Analytics, and Observability | Bundle Size | /admin, /api/v1/health, /api/v1/admin/analytics | — | — | — | — | — | — | n/a | chunks 797 KB, build 1.11 GB | P1 | completed | — |
| Public Marketing and Legal | Render Import Cost | app/page.tsx | 1.789 | 2.687 | 16.640 | 3.499 | 0.684 | 16.640 | ΔRSS 55 MB / peak 149 MB | n/a | P3 | completed | — |
| Auth, Setup, and Middleware Security | Render Import Cost | app/(auth)/sign-in/page.tsx | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: Cannot find module 'node_modules/@clerk/themes/dist/index.cjs' |
| Auth, Setup, and Middleware Security | Render Import Cost | app/setup/page.tsx | 0.883 | 1.000 | 1.169 | 0.941 | 0.798 | 1.169 | ΔRSS 400 KB / peak 150 MB | n/a | P0 | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | app/chat/page.tsx | 0.836 | 0.907 | 0.977 | 0.863 | 0.781 | 0.977 | ΔRSS 832 KB / peak 150 MB | n/a | P0 | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | components/chat/ChatPageShell.tsx | 0.867 | 0.964 | 1.515 | 0.961 | 0.775 | 1.515 | ΔRSS 144 KB / peak 150 MB | n/a | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useGeminiLive.ts | 0.871 | 1.213 | 1.408 | 0.982 | 0.799 | 1.408 | ΔRSS 272 KB / peak 151 MB | n/a | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useVoiceStateMachine.ts | 1.127 | 1.143 | 1.233 | 1.140 | 1.113 | 1.233 | ΔRSS 144 KB / peak 151 MB | n/a | P0 | completed | — |
| Memory Dashboard and Life Graph | Render Import Cost | app/memory/page.tsx | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: React is not defined |
| Memory Dashboard and Life Graph | Render Import Cost | components/memory/MemoryGraph3D.tsx | 0.686 | 0.711 | 0.731 | 0.691 | 0.644 | 0.731 | ΔRSS 32 KB / peak 151 MB | n/a | P0 | completed | — |
| Visual Memory and Life Story | Render Import Cost | components/memory/VisualMemoryGallery.tsx | 0.774 | 0.802 | 0.857 | 0.786 | 0.727 | 0.857 | ΔRSS 464 KB / peak 151 MB | n/a | P1 | completed | — |
| Visual Memory and Life Story | Render Import Cost | components/memory/LifeStoryView.tsx | 0.711 | 0.776 | 1.479 | 0.802 | 0.589 | 1.479 | ΔRSS 5.42 MB / peak 157 MB | n/a | P1 | completed | — |
| Spaces Collaboration | Render Import Cost | components/spaces/SpacesDashboard.tsx | 0.801 | 0.836 | 0.884 | 0.792 | 0.694 | 0.884 | ΔRSS 992 KB / peak 158 MB | n/a | P1 | completed | — |
| Spaces Collaboration | Render Import Cost | components/spaces/SpaceDetailView.tsx | 0.970 | 1.016 | 1.123 | 1.001 | 0.938 | 1.123 | ΔRSS 1.92 MB / peak 160 MB | n/a | P1 | completed | — |
| Budget Tracking | Render Import Cost | app/budget/page.tsx | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: React is not defined |
| Billing, Pricing, and Referrals | Render Import Cost | app/pricing/page.tsx | 0.972 | 1.091 | 4.200 | 1.295 | 0.847 | 4.200 | ΔRSS 2.30 MB / peak 169 MB | n/a | P0 | completed | — |
| Billing, Pricing, and Referrals | Render Import Cost | hooks/billing/useBilling.ts | 0.673 | 0.711 | 0.770 | 0.692 | 0.639 | 0.770 | ΔRSS 720 KB / peak 170 MB | n/a | P0 | completed | — |
| Quests and Streaks | Render Import Cost | components/quests/QuestsClient.tsx | 0.956 | 1.022 | 1.055 | 0.971 | 0.878 | 1.055 | ΔRSS 2.09 MB / peak 172 MB | n/a | P2 | completed | — |
| Sleep Sessions and Wind Down | Render Import Cost | app/wind-down/page.tsx | 1.326 | 1.613 | 1.972 | 1.414 | 0.924 | 1.972 | ΔRSS 32 KB / peak 171 MB | n/a | P2 | completed | — |
| Sleep Sessions and Wind Down | Render Import Cost | components/wind-down/SleepSessions.tsx | 1.060 | 1.295 | 1.840 | 1.164 | 0.883 | 1.840 | ΔRSS 48 KB / peak 171 MB | n/a | P2 | completed | — |
| Plugins and Productivity Integrations | Render Import Cost | app/settings/integrations/page.tsx | 1.234 | 1.735 | 3.528 | 1.533 | 0.939 | 3.528 | ΔRSS 1.08 MB / peak 173 MB | n/a | P1 | completed | — |
| Plugins and Productivity Integrations | Render Import Cost | hooks/chat/usePlugins.ts | 0.756 | 1.028 | 1.247 | 0.866 | 0.688 | 1.247 | ΔRSS 656 KB / peak 173 MB | n/a | P1 | completed | — |
| Profile Card, Settings, Notifications, and Push | Render Import Cost | components/profile/ProfileCardClient.tsx | 1.275 | 1.350 | 2.154 | 1.401 | 1.161 | 2.154 | ΔRSS 2.38 MB / peak 177 MB | n/a | P2 | completed | — |
| Profile Card, Settings, Notifications, and Push | Render Import Cost | app/settings/page.tsx | — | — | — | — | — | — | n/a | n/a | P2 | skipped | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: React is not defined |
| Mood Timeline | Render Import Cost | components/mood/MoodTimelineClient.tsx | 1.190 | 1.518 | 1.889 | 1.323 | 1.062 | 1.889 | ΔRSS 1.97 MB / peak 180 MB | n/a | P2 | completed | — |
| Admin, Health, Analytics, and Observability | Render Import Cost | app/admin/page.tsx | 1.025 | 1.546 | 2.038 | 1.222 | 0.817 | 2.038 | ΔRSS 1.64 MB / peak 181 MB | n/a | P1 | completed | — |
| Admin, Health, Analytics, and Observability | Render Import Cost | hooks/admin/useAnalytics.ts | 0.714 | 1.098 | 2.170 | 0.977 | 0.660 | 2.170 | ΔRSS 1008 KB / peak 182 MB | n/a | P1 | completed | — |
