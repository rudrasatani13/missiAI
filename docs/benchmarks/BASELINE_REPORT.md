# Baseline Report

Generated: 2026-05-01T16:56:53.867Z
Run ID: baseline-bench-2026-05-01T16-55-16-550Z
Source JSON: `benchmarks/results/baseline-20260501-222503.json`

## Commands Run

- `pnpm bench:build -- --output benchmarks/results/baseline-build-20260501-220632.json`
- `pnpm bench:baseline -- --server-command "pnpm start" --port 3000 --timeout-ms 60000 --output benchmarks/results/baseline-20260501-222503.json --markdown docs/benchmarks/BASELINE_REPORT.md`
- `pnpm bench -- --feature auth-onboarding,memory-core,visual-memory-life-story --output benchmarks/results/baseline-fixes-20260501-220632.json`
- `pnpm bench -- --feature auth-onboarding --output benchmarks/results/baseline-auth-fix-20260501-220632.json`

## Summary

- Completed: 63
- Skipped: 72
- Failed: 0
- Duration: 97.318 s
- Base URL: http://127.0.0.1:3000
- Managed server: yes

## Risk Labels

- P0 = critical performance issue
- P1 = high-impact optimization
- P2 = medium improvement
- P3 = nice-to-have

## Coverage By Benchmark Type

| Benchmark Type | Completed | Skipped | Failed |
| --- | ---: | ---: | ---: |
| HTTP Route Latency | 8 | 19 | 0 |
| Server Function Benchmark | 7 | 0 | 0 |
| API Latency | 1 | 34 | 0 |
| Mocked Integration Benchmark | 0 | 13 | 0 |
| Build Time | 2 | 0 | 0 |
| Bundle Size | 19 | 0 | 0 |
| Render Import Cost | 26 | 6 | 0 |

## Feature-Wise Benchmark Table

| Feature | Category | Completed | Skipped | Failed | Slowest Measured Target | Worst p95 (ms) | Largest Bundle | Coverage Notes |
| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |
| Public Marketing and Legal | marketing | 7 | 0 | 0 | http://127.0.0.1:3000/privacy | 32.702 | 658 KB | Measured |
| Auth, Setup, and Middleware Security | auth | 5 | 2 | 0 | http://127.0.0.1:3000/sign-up | 10.928 | 446 KB | Auth-gated coverage |
| Chat Core and SSE Streaming | conversation | 3 | 5 | 0 | app/chat/page.tsx | 3.088 | 1.11 MB | Auth-gated coverage |
| Voice, STT, TTS, and Live Relay | voice | 3 | 4 | 0 | hooks/chat/useVoiceStateMachine.ts | 2.312 | 1.11 MB | Auth-gated coverage |
| Memory Dashboard and Life Graph | memory | 3 | 5 | 0 | components/memory/MemoryGraph3D.tsx | 1.305 | 1.01 MB | Auth-gated coverage |
| Visual Memory and Life Story | memory | 4 | 4 | 0 | components/memory/LifeStoryView.tsx | 1.828 | 1.07 MB | Auth-gated coverage |
| Spaces Collaboration | collaboration | 5 | 3 | 0 | http://127.0.0.1:3000/join/fake-token | 14.189 | 902 KB | Auth-gated coverage |
| Budget Tracking | finance | 1 | 5 | 0 | — | — | 1.03 MB | Auth-gated coverage |
| Billing, Pricing, and Referrals | revenue | 4 | 4 | 0 | http://127.0.0.1:3000/pricing | 4.301 | 1019 KB | Auth-gated coverage |
| Quests and Streaks | gamification | 3 | 4 | 0 | components/quests/QuestsClient.tsx | 0.656 | 1.04 MB | Auth-gated coverage |
| Daily Brief and Proactive Nudges | assistant | 2 | 4 | 0 | components/daily-brief/TodayMissionClient.tsx | 1.001 | 1012 KB | Auth-gated coverage |
| Sleep Sessions and Wind Down | wellbeing | 4 | 3 | 0 | components/wind-down/SleepSessions.tsx | 0.959 | 893 KB | Auth-gated coverage |
| Exam Buddy | education | 1 | 6 | 0 | — | — | 1.32 MB | Auth-gated coverage |
| Plugins and Productivity Integrations | integrations | 3 | 4 | 0 | app/settings/integrations/page.tsx | 0.755 | 878 KB | Auth-gated coverage |
| Messaging Bots and Public Webhooks | integrations | 1 | 4 | 0 | — | — | 1.01 MB | Auth-gated coverage |
| Agents, Actions, and Tool Execution | automation | 3 | 4 | 0 | hooks/chat/useActionEngine.ts | 0.963 | 1.13 MB | Auth-gated coverage |
| Profile Card, Settings, Notifications, and Push | account | 2 | 5 | 0 | components/profile/ProfileCardClient.tsx | 0.778 | 1.04 MB | Auth-gated coverage |
| Mood Timeline | wellbeing | 2 | 3 | 0 | components/mood/MoodTimelineClient.tsx | 0.696 | 1014 KB | Auth-gated coverage |
| Admin, Health, Analytics, and Observability | operations | 5 | 3 | 0 | http://127.0.0.1:3000/api/v1/health | 3.206 | 794 KB | Auth-gated coverage |
| Workspace Build Pipeline | infrastructure | 2 | 0 | 0 | pnpm run build | 51608.000 | build 975 MB / open-next 59.2 MB | Measured |

## Route/API/Function-Level Timing

| Feature | Benchmark Type | Route/API/Function | p50 | p75 | p95 | Avg | Min | Max | Std Dev | Memory | Status | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| Workspace Build Pipeline | Build Time | pnpm run build | 51608.000 | 51608.000 | 51608.000 | 51608.000 | 51608.000 | 51608.000 | 0.000 | n/a | completed | Build completed successfully. / warn - If this is content and not a class, replace it with `ease-&lsqb;cubic-bezier(0.22,1,0.36,1)&rsqb;` to silence this warning.   ⚠ The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config |
| Workspace Build Pipeline | Build Time | pnpm run build:cf | 41141.000 | 41141.000 | 41141.000 | 41141.000 | 41141.000 | 41141.000 | 0.000 | n/a | completed | Build completed successfully. / .open-next/server-functions/default/.next/server/chunks/7284.js:1:147834:       1 │ ...1:return em(a,2790,2799,!0,d);case 22:return em(a,2662,2671,!0,d...         ╵                                  ~~~~ |
| Public Marketing and Legal | HTTP Route Latency | http://127.0.0.1:3000/privacy | 6.828 | 9.246 | 32.702 | 9.414 | 3.875 | 32.702 | 8.027 | peak 38.7 MB; delta -12.0 MB | completed | — |
| Public Marketing and Legal | HTTP Route Latency | http://127.0.0.1:3000/ | 5.382 | 9.804 | 17.451 | 7.545 | 3.764 | 17.451 | 4.122 | peak 87.3 MB; delta -6.83 MB | completed | — |
| Spaces Collaboration | HTTP Route Latency | http://127.0.0.1:3000/join/fake-token | 9.729 | 11.403 | 14.189 | 10.406 | 7.963 | 14.189 | 1.842 | peak 26.7 MB; delta -288 KB | completed | — |
| Auth, Setup, and Middleware Security | HTTP Route Latency | http://127.0.0.1:3000/sign-up | 4.076 | 4.344 | 10.928 | 4.785 | 3.339 | 10.928 | 2.099 | peak 26.7 MB; delta 0 B | completed | — |
| Public Marketing and Legal | HTTP Route Latency | http://127.0.0.1:3000/manifesto | 4.837 | 7.341 | 10.307 | 5.972 | 3.232 | 10.307 | 2.448 | peak 80.4 MB; delta -41.7 MB | completed | — |
| Auth, Setup, and Middleware Security | HTTP Route Latency | http://127.0.0.1:3000/sign-in | 3.629 | 4.708 | 6.799 | 4.240 | 3.203 | 6.799 | 1.010 | peak 26.7 MB; delta 0 B | completed | — |
| Public Marketing and Legal | HTTP Route Latency | http://127.0.0.1:3000/terms | 4.011 | 4.534 | 6.041 | 4.349 | 3.585 | 6.041 | 0.679 | peak 26.7 MB; delta -48.0 KB | completed | — |
| Billing, Pricing, and Referrals | HTTP Route Latency | http://127.0.0.1:3000/pricing | 3.580 | 3.885 | 4.301 | 3.632 | 3.019 | 4.301 | 0.363 | peak 26.4 MB; delta -64.0 KB | completed | — |
| Admin, Health, Analytics, and Observability | API Latency | http://127.0.0.1:3000/api/v1/health | 2.937 | 3.052 | 3.206 | 2.848 | 2.355 | 3.206 | 0.268 | peak 26.3 MB; delta 0 B | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | app/chat/page.tsx | 1.033 | 1.305 | 3.088 | 1.353 | 0.611 | 3.088 | 0.773 | peak 166 MB; delta 13.3 MB | completed | — |
| Billing, Pricing, and Referrals | Render Import Cost | app/pricing/page.tsx | 1.785 | 1.989 | 2.844 | 1.877 | 1.230 | 2.844 | 0.402 | peak 178 MB; delta 272 KB | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useVoiceStateMachine.ts | 0.973 | 1.070 | 2.312 | 1.143 | 0.852 | 2.312 | 0.427 | peak 168 MB; delta 736 KB | completed | — |
| Visual Memory and Life Story | Render Import Cost | components/memory/LifeStoryView.tsx | 1.415 | 1.674 | 1.828 | 1.399 | 0.679 | 1.828 | 0.342 | peak 172 MB; delta 3.03 MB | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | components/chat/ChatPageShell.tsx | 0.808 | 1.139 | 1.765 | 0.961 | 0.614 | 1.765 | 0.319 | peak 167 MB; delta 1.33 MB | completed | — |
| Spaces Collaboration | Render Import Cost | components/spaces/SpacesDashboard.tsx | 0.759 | 0.837 | 1.651 | 0.866 | 0.556 | 1.651 | 0.300 | peak 172 MB; delta 80.0 KB | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useGeminiLive.ts | 0.647 | 0.859 | 1.568 | 0.812 | 0.571 | 1.568 | 0.332 | peak 168 MB; delta 304 KB | completed | — |
| Spaces Collaboration | Render Import Cost | components/spaces/SpaceDetailView.tsx | 0.986 | 1.255 | 1.545 | 1.072 | 0.701 | 1.545 | 0.245 | peak 172 MB; delta 320 KB | completed | — |
| Billing, Pricing, and Referrals | Render Import Cost | hooks/billing/useBilling.ts | 0.899 | 1.110 | 1.464 | 0.940 | 0.584 | 1.464 | 0.246 | peak 178 MB; delta 16.0 KB | completed | — |
| Memory Dashboard and Life Graph | Render Import Cost | components/memory/MemoryGraph3D.tsx | 0.686 | 0.810 | 1.305 | 0.756 | 0.534 | 1.305 | 0.201 | peak 168 MB; delta 112 KB | completed | — |
| Visual Memory and Life Story | Render Import Cost | components/memory/VisualMemoryGallery.tsx | 0.848 | 1.050 | 1.231 | 0.901 | 0.585 | 1.231 | 0.193 | peak 169 MB; delta 144 KB | completed | — |
| Public Marketing and Legal | Render Import Cost | app/page.tsx | 0.611 | 0.969 | 1.135 | 0.762 | 0.475 | 1.135 | 0.236 | peak 151 MB; delta 63.4 MB | completed | — |
| Public Marketing and Legal | Render Import Cost | components/landing/AgenticMissiHome.tsx | 1.008 | 1.090 | 1.116 | 1.031 | 0.929 | 1.116 | 0.063 | peak 152 MB; delta 784 KB | completed | — |
| Daily Brief and Proactive Nudges | Render Import Cost | components/daily-brief/TodayMissionClient.tsx | 0.621 | 0.676 | 1.001 | 0.671 | 0.589 | 1.001 | 0.117 | peak 178 MB; delta 128 KB | completed | — |
| Admin, Health, Analytics, and Observability | Render Import Cost | app/admin/page.tsx | 0.567 | 0.598 | 0.963 | 0.638 | 0.535 | 0.963 | 0.145 | peak 192 MB; delta 1.53 MB | completed | — |
| Agents, Actions, and Tool Execution | Render Import Cost | hooks/chat/useActionEngine.ts | 0.476 | 0.518 | 0.963 | 0.525 | 0.408 | 0.963 | 0.151 | peak 185 MB; delta 496 KB | completed | — |
| Sleep Sessions and Wind Down | Render Import Cost | components/wind-down/SleepSessions.tsx | 0.558 | 0.574 | 0.959 | 0.594 | 0.527 | 0.959 | 0.123 | peak 179 MB; delta 736 KB | completed | — |
| Profile Card, Settings, Notifications, and Push | Render Import Cost | components/profile/ProfileCardClient.tsx | 0.741 | 0.755 | 0.778 | 0.746 | 0.723 | 0.778 | 0.017 | peak 188 MB; delta 2.34 MB | completed | — |
| Agents, Actions, and Tool Execution | Render Import Cost | components/agents/AgentDashboard.tsx | 0.673 | 0.702 | 0.758 | 0.688 | 0.648 | 0.758 | 0.031 | peak 185 MB; delta 1.97 MB | completed | — |
| Plugins and Productivity Integrations | Render Import Cost | app/settings/integrations/page.tsx | 0.545 | 0.601 | 0.755 | 0.573 | 0.512 | 0.755 | 0.068 | peak 182 MB; delta 1.14 MB | completed | — |
| Mood Timeline | Render Import Cost | components/mood/MoodTimelineClient.tsx | 0.660 | 0.678 | 0.696 | 0.669 | 0.653 | 0.696 | 0.014 | peak 190 MB; delta 1.98 MB | completed | — |
| Auth, Setup, and Middleware Security | Render Import Cost | app/setup/page.tsx | 0.530 | 0.565 | 0.679 | 0.556 | 0.508 | 0.679 | 0.052 | peak 153 MB; delta 272 KB | completed | — |
| Quests and Streaks | Render Import Cost | components/quests/QuestsClient.tsx | 0.612 | 0.620 | 0.656 | 0.617 | 0.593 | 0.656 | 0.018 | peak 178 MB; delta 80.0 KB | completed | — |
| Sleep Sessions and Wind Down | Render Import Cost | app/wind-down/page.tsx | 0.483 | 0.500 | 0.564 | 0.498 | 0.470 | 0.564 | 0.028 | peak 178 MB; delta 160 KB | completed | — |
| Plugins and Productivity Integrations | Render Import Cost | hooks/chat/usePlugins.ts | 0.454 | 0.487 | 0.537 | 0.464 | 0.416 | 0.537 | 0.041 | peak 183 MB; delta 608 KB | completed | — |
| Admin, Health, Analytics, and Observability | Render Import Cost | hooks/admin/useAnalytics.ts | 0.410 | 0.428 | 0.476 | 0.420 | 0.400 | 0.476 | 0.023 | peak 192 MB; delta 512 KB | completed | — |
| Quests and Streaks | Server Function Benchmark | lib/quests/quest-generator.ts#sanitizeQuestText | 0.005 | 0.009 | 0.011 | 0.006 | 0.003 | 0.011 | 0.003 | peak 82.5 MB; delta 80.0 KB | completed | — |
| Visual Memory and Life Story | Server Function Benchmark | lib/visual-memory/image-analyzer.ts#mapExtractionToLifeNode | 0.002 | 0.005 | 0.007 | 0.003 | 0.001 | 0.007 | 0.002 | peak 75.0 MB; delta 32.0 KB | completed | — |
| Sleep Sessions and Wind Down | Server Function Benchmark | lib/sleep-sessions/story-generator.ts#sanitizeStoryText | 0.004 | 0.004 | 0.006 | 0.004 | 0.002 | 0.006 | 0.001 | peak 82.9 MB; delta 32.0 KB | completed | — |
| Spaces Collaboration | Server Function Benchmark | lib/spaces/space-store.ts#roleForUser | 0.001 | 0.001 | 0.005 | 0.001 | 0.000 | 0.005 | 0.001 | peak 79.8 MB; delta 16.0 KB | completed | — |
| Memory Dashboard and Life Graph | Server Function Benchmark | lib/memory/life-graph.ts#formatLifeGraphForPrompt | 0.002 | 0.002 | 0.004 | 0.002 | 0.001 | 0.004 | 0.001 | peak 73.0 MB; delta 32.0 KB | completed | — |
| Admin, Health, Analytics, and Observability | Server Function Benchmark | lib/analytics/aggregator.ts#calculateGrowthRate | 0.000 | 0.000 | 0.001 | 0.000 | 0.000 | 0.001 | 0.000 | peak 84.2 MB; delta 0 B | completed | — |
| Auth, Setup, and Middleware Security | Server Function Benchmark | lib/setup/setup-completion.ts#hasCompletedSetupLocally | 0.001 | 0.001 | 0.001 | 0.001 | 0.001 | 0.001 | 0.000 | peak 70.4 MB; delta 32.0 KB | completed | Local setup completion helper benchmarked in the Node runtime; it should return false when window is unavailable. |

## Build And Bundle Impact

Build output size below is the artifact size measured by the benchmark script for `.next` and `.open-next`, including caches and traces. It is not a direct proxy for shipped browser JavaScript.

### Build Commands

| Command | p95 (ms) | Avg (ms) | Build Output | Notes |
| --- | ---: | ---: | ---: | --- |
| pnpm run build | 51608.000 | 51608.000 | build 975 MB / open-next 59.2 MB | Build completed successfully. / warn - If this is content and not a class, replace it with `ease-&lsqb;cubic-bezier(0.22,1,0.36,1)&rsqb;` to silence this warning.   ⚠ The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config |
| pnpm run build:cf | 41141.000 | 41141.000 | build 1.01 GB / open-next 59.2 MB | Build completed successfully. / .open-next/server-functions/default/.next/server/chunks/7284.js:1:147834:       1 │ ...1:return em(a,2790,2799,!0,d);case 22:return em(a,2662,2671,!0,d...         ╵                                  ~~~~ |

### Feature Bundle Footprint

| Feature | Targets | Total Chunk Bytes | Approx Chunk Size | Build Output | Notes |
| --- | --- | ---: | ---: | ---: | --- |
| Exam Buddy | /exam-buddy, /api/v1/exam-buddy/profile, /api/v1/exam-buddy/quiz | 1382772 | 1.32 MB | — | — |
| Agents, Actions, and Tool Execution | /agents, /chat, /api/v1/agents/[...path], /api/v1/actions | 1187714 | 1.13 MB | — | — |
| Voice, STT, TTS, and Live Relay | /chat, /api/v1/live-token, /api/v1/stt, /api/v1/tts | 1159976 | 1.11 MB | — | — |
| Chat Core and SSE Streaming | /chat, /api/v1/chat, /api/v1/chat-stream | 1159465 | 1.11 MB | — | — |
| Visual Memory and Life Story | /memory/visual, /memory/story, /api/v1/visual-memory/[[...path]], /api/v1/life-story/[...path] | 1123045 | 1.07 MB | — | — |
| Profile Card, Settings, Notifications, and Push | /profile, /settings, /api/v1/profile/card, /api/v1/notification-prefs | 1094342 | 1.04 MB | — | — |
| Quests and Streaks | /quests, /streak, /api/v1/quests, /api/v1/streak | 1094244 | 1.04 MB | — | — |
| Budget Tracking | /budget, /api/v1/budget/entries, /api/v1/budget/insight | 1082557 | 1.03 MB | — | — |
| Messaging Bots and Public Webhooks | /settings/integrations, /profile, /api/v1/bot/link/whatsapp, /api/webhooks/telegram, /api/webhooks/whatsapp | 1062601 | 1.01 MB | — | — |
| Memory Dashboard and Life Graph | /memory, /memory/graph, /api/v1/memory | 1060584 | 1.01 MB | — | — |
| Billing, Pricing, and Referrals | /pricing, /api/v1/billing, /api/v1/referral, /api/webhooks/dodo | 1043408 | 1019 KB | — | — |
| Mood Timeline | /mood, /api/v1/mood/timeline | 1038458 | 1014 KB | — | — |
| Daily Brief and Proactive Nudges | /today, /api/v1/daily-brief/[[...path]], /api/v1/proactive | 1035937 | 1012 KB | — | — |
| Spaces Collaboration | /spaces, /spaces/[spaceId], /join/[token], /api/v1/spaces, /api/v1/spaces/[spaceId] | 923511 | 902 KB | — | — |
| Sleep Sessions and Wind Down | /wind-down, /api/v1/wind-down, /api/v1/sleep-sessions/[...path] | 914710 | 893 KB | — | — |
| Plugins and Productivity Integrations | /settings/integrations, /api/v1/plugins/[[...path]], /api/v1/tools/execute | 899065 | 878 KB | — | — |
| Admin, Health, Analytics, and Observability | /admin, /api/v1/health, /api/v1/admin/analytics | 813101 | 794 KB | — | — |
| Public Marketing and Legal | /, /manifesto, /privacy, /terms | 673335 | 658 KB | — | Missing route manifest keys: /privacy/page, /terms/page |
| Auth, Setup, and Middleware Security | /sign-in, /sign-up, /setup | 456391 | 446 KB | — | Missing route manifest keys: /sign-in/page, /sign-up/page |

## Highest Observed Memory Peaks

| Feature | Target | Peak RSS | RSS Delta |
| --- | --- | ---: | ---: |
| Admin, Health, Analytics, and Observability | hooks/admin/useAnalytics.ts | 192 MB | 512 KB |
| Admin, Health, Analytics, and Observability | app/admin/page.tsx | 192 MB | 1.53 MB |
| Mood Timeline | components/mood/MoodTimelineClient.tsx | 190 MB | 1.98 MB |
| Profile Card, Settings, Notifications, and Push | components/profile/ProfileCardClient.tsx | 188 MB | 2.34 MB |
| Agents, Actions, and Tool Execution | hooks/chat/useActionEngine.ts | 185 MB | 496 KB |
| Agents, Actions, and Tool Execution | components/agents/AgentDashboard.tsx | 185 MB | 1.97 MB |
| Plugins and Productivity Integrations | hooks/chat/usePlugins.ts | 183 MB | 608 KB |
| Plugins and Productivity Integrations | app/settings/integrations/page.tsx | 182 MB | 1.14 MB |
| Sleep Sessions and Wind Down | components/wind-down/SleepSessions.tsx | 179 MB | 736 KB |
| Sleep Sessions and Wind Down | app/wind-down/page.tsx | 178 MB | 160 KB |
| Daily Brief and Proactive Nudges | components/daily-brief/TodayMissionClient.tsx | 178 MB | 128 KB |
| Quests and Streaks | components/quests/QuestsClient.tsx | 178 MB | 80.0 KB |
| Billing, Pricing, and Referrals | hooks/billing/useBilling.ts | 178 MB | 16.0 KB |
| Billing, Pricing, and Referrals | app/pricing/page.tsx | 178 MB | 272 KB |
| Spaces Collaboration | components/spaces/SpaceDetailView.tsx | 172 MB | 320 KB |

## Skipped Benchmarks

| Skip Reason | Count |
| --- | ---: |
| Auth-required target skipped because no benchmark auth headers or cookies were supplied. | 46 |
| Target marked as provider-backed. Re-run with fixture support or --allow-external-calls. | 3 |
| Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: React is not defined | 3 |
| Catch-all route expects a concrete sub-path in fixtures. / Auth-required target skipped because no benchmark auth headers or cookies were supplied. | 2 |
| Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: Invalid or unexpected token | 2 |
| Use mock provider fixtures for LLM latency baselines. / Auth-required target skipped because no benchmark auth headers or cookies were supplied. | 1 |
| Exercise auth, rate-limit, and payload validation without calling providers. / Fixture module not found yet: benchmarks/fixtures/chat/route-preflight.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/chat/stream-preflight.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/voice/live-transport.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/memory/graph-extractor.fixture.ts | 1 |
| Use a concrete sub-path when the fixture suite is added. / Auth-required target skipped because no benchmark auth headers or cookies were supplied. | 1 |
| Fixture module not found yet: benchmarks/fixtures/budget/monthly-totals.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/billing/referral.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/proactive/daily-brief.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/exam-buddy/quiz-generator.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/plugins/plugin-command.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/bots/bot-pipeline.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/agents/action-executor.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/mood/mood-analyzer.fixture.ts | 1 |
| Fixture module not found yet: benchmarks/fixtures/admin/analytics-snapshot.fixture.ts | 1 |
| Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: Cannot find module 'node_modules/@clerk/themes/dist/index.cjs' | 1 |

### Detailed Skipped Inventory

| Feature | Benchmark Type | Route/API/Function | Reason |
| --- | --- | --- | --- |
| Auth, Setup, and Middleware Security | HTTP Route Latency | http://127.0.0.1:3000/setup | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | HTTP Route Latency | http://127.0.0.1:3000/chat | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | API Latency | http://127.0.0.1:3000/api/v1/chat | Use mock provider fixtures for LLM latency baselines. / Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | API Latency | http://127.0.0.1:3000/api/v1/chat-stream | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | Mocked Integration Benchmark | lib/server/chat/route-preflight.ts#runChatRoutePreflight | Exercise auth, rate-limit, and payload validation without calling providers. / Fixture module not found yet: benchmarks/fixtures/chat/route-preflight.fixture.ts |
| Chat Core and SSE Streaming | Mocked Integration Benchmark | lib/server/chat/stream-preflight.ts#runChatStreamPreflight | Fixture module not found yet: benchmarks/fixtures/chat/stream-preflight.fixture.ts |
| Voice, STT, TTS, and Live Relay | API Latency | http://127.0.0.1:3000/api/v1/live-token | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | API Latency | http://127.0.0.1:3000/api/v1/stt | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | API Latency | http://127.0.0.1:3000/api/v1/tts | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | Mocked Integration Benchmark | lib/ai/live/transport.ts#getLiveTransportSession | Fixture module not found yet: benchmarks/fixtures/voice/live-transport.fixture.ts |
| Memory Dashboard and Life Graph | HTTP Route Latency | http://127.0.0.1:3000/memory | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Memory Dashboard and Life Graph | HTTP Route Latency | http://127.0.0.1:3000/memory/graph | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Memory Dashboard and Life Graph | API Latency | http://127.0.0.1:3000/api/v1/memory | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Memory Dashboard and Life Graph | Mocked Integration Benchmark | lib/memory/graph-extractor.ts#extractLifeNodes | Fixture module not found yet: benchmarks/fixtures/memory/graph-extractor.fixture.ts |
| Visual Memory and Life Story | HTTP Route Latency | http://127.0.0.1:3000/memory/visual | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Visual Memory and Life Story | HTTP Route Latency | http://127.0.0.1:3000/memory/story | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Visual Memory and Life Story | API Latency | http://127.0.0.1:3000/api/v1/visual-memory/entries | Use a concrete sub-path when the fixture suite is added. / Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Visual Memory and Life Story | API Latency | http://127.0.0.1:3000/api/v1/life-story/summary | Catch-all route expects a concrete sub-path in fixtures. / Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Spaces Collaboration | HTTP Route Latency | http://127.0.0.1:3000/spaces | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Spaces Collaboration | API Latency | http://127.0.0.1:3000/api/v1/spaces | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Spaces Collaboration | API Latency | http://127.0.0.1:3000/api/v1/spaces/fixture-space | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Budget Tracking | HTTP Route Latency | http://127.0.0.1:3000/budget | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Budget Tracking | API Latency | http://127.0.0.1:3000/api/v1/budget/entries | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Budget Tracking | API Latency | http://127.0.0.1:3000/api/v1/budget/insight | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Budget Tracking | Mocked Integration Benchmark | lib/budget/budget-store.ts#buildMonthlyTotals | Fixture module not found yet: benchmarks/fixtures/budget/monthly-totals.fixture.ts |
| Billing, Pricing, and Referrals | API Latency | http://127.0.0.1:3000/api/v1/billing | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Billing, Pricing, and Referrals | API Latency | http://127.0.0.1:3000/api/v1/referral | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Billing, Pricing, and Referrals | API Latency | http://127.0.0.1:3000/api/webhooks/dodo | Target marked as provider-backed. Re-run with fixture support or --allow-external-calls. |
| Billing, Pricing, and Referrals | Mocked Integration Benchmark | lib/billing/referral.ts#trackReferral | Fixture module not found yet: benchmarks/fixtures/billing/referral.fixture.ts |
| Quests and Streaks | HTTP Route Latency | http://127.0.0.1:3000/quests | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Quests and Streaks | HTTP Route Latency | http://127.0.0.1:3000/streak | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Quests and Streaks | API Latency | http://127.0.0.1:3000/api/v1/quests | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Quests and Streaks | API Latency | http://127.0.0.1:3000/api/v1/streak | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Daily Brief and Proactive Nudges | HTTP Route Latency | http://127.0.0.1:3000/today | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Daily Brief and Proactive Nudges | API Latency | http://127.0.0.1:3000/api/v1/daily-brief | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Daily Brief and Proactive Nudges | API Latency | http://127.0.0.1:3000/api/v1/proactive | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Daily Brief and Proactive Nudges | Mocked Integration Benchmark | lib/proactive/briefing-generator.ts#generateDailyBriefing | Fixture module not found yet: benchmarks/fixtures/proactive/daily-brief.fixture.ts |
| Sleep Sessions and Wind Down | HTTP Route Latency | http://127.0.0.1:3000/wind-down | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Sleep Sessions and Wind Down | API Latency | http://127.0.0.1:3000/api/v1/wind-down | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Sleep Sessions and Wind Down | API Latency | http://127.0.0.1:3000/api/v1/sleep-sessions/list | Catch-all route expects a concrete sub-path in fixtures. / Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Exam Buddy | HTTP Route Latency | http://127.0.0.1:3000/exam-buddy | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Exam Buddy | API Latency | http://127.0.0.1:3000/api/v1/exam-buddy/profile | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Exam Buddy | API Latency | http://127.0.0.1:3000/api/v1/exam-buddy/quiz | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Exam Buddy | Mocked Integration Benchmark | lib/exam-buddy/quiz-generator.ts#generateQuizWithDiagnostics | Fixture module not found yet: benchmarks/fixtures/exam-buddy/quiz-generator.fixture.ts |
| Plugins and Productivity Integrations | HTTP Route Latency | http://127.0.0.1:3000/settings/integrations | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Plugins and Productivity Integrations | API Latency | http://127.0.0.1:3000/api/v1/plugins | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Plugins and Productivity Integrations | API Latency | http://127.0.0.1:3000/api/v1/tools/execute | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Plugins and Productivity Integrations | Mocked Integration Benchmark | lib/plugins/plugin-executor.ts#buildPluginCommand | Fixture module not found yet: benchmarks/fixtures/plugins/plugin-command.fixture.ts |
| Messaging Bots and Public Webhooks | API Latency | http://127.0.0.1:3000/api/v1/bot/link/whatsapp | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Messaging Bots and Public Webhooks | API Latency | http://127.0.0.1:3000/api/webhooks/telegram | Target marked as provider-backed. Re-run with fixture support or --allow-external-calls. |
| Messaging Bots and Public Webhooks | API Latency | http://127.0.0.1:3000/api/webhooks/whatsapp | Target marked as provider-backed. Re-run with fixture support or --allow-external-calls. |
| Messaging Bots and Public Webhooks | Mocked Integration Benchmark | lib/bot/bot-pipeline.ts#processBotMessage | Fixture module not found yet: benchmarks/fixtures/bots/bot-pipeline.fixture.ts |
| Agents, Actions, and Tool Execution | HTTP Route Latency | http://127.0.0.1:3000/agents | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Agents, Actions, and Tool Execution | API Latency | http://127.0.0.1:3000/api/v1/actions | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Agents, Actions, and Tool Execution | API Latency | http://127.0.0.1:3000/api/v1/agents/history | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Agents, Actions, and Tool Execution | Mocked Integration Benchmark | lib/actions/action-executor.ts#executeAction | Fixture module not found yet: benchmarks/fixtures/agents/action-executor.fixture.ts |
| Profile Card, Settings, Notifications, and Push | HTTP Route Latency | http://127.0.0.1:3000/profile | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Profile Card, Settings, Notifications, and Push | HTTP Route Latency | http://127.0.0.1:3000/settings | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Profile Card, Settings, Notifications, and Push | API Latency | http://127.0.0.1:3000/api/v1/profile/card | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Profile Card, Settings, Notifications, and Push | API Latency | http://127.0.0.1:3000/api/v1/notification-prefs | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Mood Timeline | HTTP Route Latency | http://127.0.0.1:3000/mood | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Mood Timeline | API Latency | http://127.0.0.1:3000/api/v1/mood/timeline | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Mood Timeline | Mocked Integration Benchmark | lib/mood/mood-analyzer.ts#analyzeMoodFromConversation | Fixture module not found yet: benchmarks/fixtures/mood/mood-analyzer.fixture.ts |
| Admin, Health, Analytics, and Observability | HTTP Route Latency | http://127.0.0.1:3000/admin | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Admin, Health, Analytics, and Observability | API Latency | http://127.0.0.1:3000/api/v1/admin/analytics | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Admin, Health, Analytics, and Observability | Mocked Integration Benchmark | lib/analytics/aggregator.ts#buildAnalyticsSnapshot | Fixture module not found yet: benchmarks/fixtures/admin/analytics-snapshot.fixture.ts |
| Auth, Setup, and Middleware Security | Render Import Cost | app/(auth)/sign-in/page.tsx | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: Cannot find module 'node_modules/@clerk/themes/dist/index.cjs' |
| Memory Dashboard and Life Graph | Render Import Cost | app/memory/page.tsx | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: React is not defined |
| Budget Tracking | Render Import Cost | app/budget/page.tsx | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: React is not defined |
| Exam Buddy | Render Import Cost | components/exam-buddy/ExamBuddyHub.tsx | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: Invalid or unexpected token |
| Exam Buddy | Render Import Cost | components/exam-buddy/QuizView.tsx | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: Invalid or unexpected token |
| Profile Card, Settings, Notifications, and Push | Render Import Cost | app/settings/page.tsx | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: React is not defined |

## Top 10 Bottlenecks

| Rank | Feature | Benchmark Type | Target | Evidence | Suspected Files |
| ---: | --- | --- | --- | --- | --- |
| 1 | Workspace Build Pipeline | Build Time | pnpm run build | 51608.000 ms p95 / 51608.000 ms avg | next.config.mjs, app/layout.tsx, app/chat/page.tsx, components/chat/ChatPageShell.tsx |
| 2 | Workspace Build Pipeline | Build Time | pnpm run build:cf | 41141.000 ms p95 / 41141.000 ms avg | open-next.config.ts, workers/entry.ts, middleware.ts, next.config.mjs |
| 3 | Exam Buddy | Bundle Size | /exam-buddy, /api/v1/exam-buddy/profile, /api/v1/exam-buddy/quiz | 1.32 MB chunks | app/exam-buddy/page.tsx, components/exam-buddy/ExamBuddyHub.tsx, components/exam-buddy/QuizView.tsx, lib/exam-buddy/quiz-generator.ts |
| 4 | Agents, Actions, and Tool Execution | Bundle Size | /agents, /chat, /api/v1/agents/[...path], /api/v1/actions | 1.13 MB chunks | app/agents/page.tsx, components/agents/AgentDashboard.tsx, hooks/chat/useActionEngine.ts, lib/actions/action-executor.ts |
| 5 | Voice, STT, TTS, and Live Relay | Bundle Size | /chat, /api/v1/live-token, /api/v1/stt, /api/v1/tts | 1.11 MB chunks | app/chat/page.tsx, hooks/chat/useGeminiLive.ts, hooks/chat/useVoiceStateMachine.ts, app/api/v1/live-token/route.ts, lib/ai/services/voice-service.ts |
| 6 | Chat Core and SSE Streaming | Bundle Size | /chat, /api/v1/chat, /api/v1/chat-stream | 1.11 MB chunks | app/chat/page.tsx, components/chat/ChatPageShell.tsx, components/chat/ConversationLog.tsx |
| 7 | Visual Memory and Life Story | Bundle Size | /memory/visual, /memory/story, /api/v1/visual-memory/[[...path]], /api/v1/life-story/[...path] | 1.07 MB chunks | components/memory/VisualMemoryGallery.tsx, components/memory/LifeStoryView.tsx, app/memory/page.tsx |
| 8 | Public Marketing and Legal | HTTP Route Latency | http://127.0.0.1:3000/privacy | 32.702 ms p95 / 9.414 ms avg | app/(legal)/privacy/page.tsx, app/layout.tsx |
| 9 | Public Marketing and Legal | HTTP Route Latency | http://127.0.0.1:3000/ | 17.451 ms p95 / 7.545 ms avg | app/page.tsx, components/landing/AgenticMissiHome.tsx, components/landing/ProductShowcase.tsx |
| 10 | Spaces Collaboration | HTTP Route Latency | http://127.0.0.1:3000/join/fake-token | 14.189 ms p95 / 10.406 ms avg | app/join/[token]/page.tsx, lib/spaces/space-store.ts, lib/spaces/space-api-helpers.ts |

## Interpretation

- The first optimization pass should target build time and chunk weight. `pnpm run build` and `pnpm run build:cf` dominate every other measurement by orders of magnitude, and several feature bundles are already above ~1 MB of chunk output.
- Route and API coverage is partial by design in this baseline. Public endpoints were measured live; auth-gated features were skipped rather than forced with secrets or fake auth.
- Mocked integration coverage is still incomplete because several fixture modules under `benchmarks/fixtures/` have not been implemented yet. Those targets were skipped cleanly, not faked.
- The highest live route outliers in this run were `/privacy`, `/`, and `/join/fake-token`. The heaviest client surfaces were Exam Buddy, Agents/Actions, Voice/Live, Chat Core, and Visual Memory/Life Story.
