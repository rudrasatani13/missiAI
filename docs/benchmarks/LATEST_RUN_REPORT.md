# Latest Benchmark Run

Generated: 2026-05-02T11:51:16.175Z
Run ID: feature-bench-2026-05-02T11-47-59-274Z
Selected features: chat-core, voice-live
Baseline mode: no
Base URL: http://127.0.0.1:3000

## Summary
- Completed: 11
- Skipped: 13
- Failed: 0
- Duration: 196.901 s

## Risk Labels
- P0 = critical performance issue
- P1 = high-impact optimization
- P2 = medium improvement
- P3 = nice-to-have

## Results

| Feature | Benchmark Type | Route/API/Function | p50 | p75 | p95 | Avg | Min | Max | Memory | Bundle Impact | Risk | Status | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| Chat Core and SSE Streaming | Http Route Latency | http://127.0.0.1:3000/chat | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | Api Latency | http://127.0.0.1:3000/api/v1/chat | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Use mock provider fixtures for LLM latency baselines. \| Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | Api Latency | http://127.0.0.1:3000/api/v1/chat-stream | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Chat Core and SSE Streaming | Mocked Integration Benchmark | lib/server/chat/route-preflight.ts#runChatRoutePreflight | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Exercise auth, rate-limit, and payload validation without calling providers. \| Fixture module not found yet: benchmarks/fixtures/chat/route-preflight.fixture.ts |
| Chat Core and SSE Streaming | Mocked Integration Benchmark | lib/server/chat/stream-preflight.ts#runChatStreamPreflight | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Fixture module not found yet: benchmarks/fixtures/chat/stream-preflight.fixture.ts |
| Voice, STT, TTS, and Live Relay | Api Latency | http://127.0.0.1:3000/api/v1/live-token | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | Api Latency | http://127.0.0.1:3000/api/v1/stt | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | Api Latency | http://127.0.0.1:3000/api/v1/tts | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Voice, STT, TTS, and Live Relay | Mocked Integration Benchmark | lib/ai/live/transport.ts#getLiveTransportSession | — | — | — | — | — | — | n/a | n/a | P0 | skipped | Fixture module not found yet: benchmarks/fixtures/voice/live-transport.fixture.ts |
| Workspace Build Pipeline | Build Time | pnpm run build | 124435.000 | 124435.000 | 124435.000 | 124435.000 | 124435.000 | 124435.000 | n/a | chunks 0 B, build 1.05 GB | P0 | completed | Build completed successfully. \| warn - If this is content and not a class, replace it with `ease-&lsqb;cubic-bezier(0.22,1,0.36,1)&rsqb;` to silence this warning.   ⚠ The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config |
| Workspace Build Pipeline | Build Time | pnpm run build:cf | 70850.000 | 70850.000 | 70850.000 | 70850.000 | 70850.000 | 70850.000 | n/a | chunks 0 B, build 1.11 GB | P0 | completed | Build completed successfully. \| .open-next/server-functions/default/.next/server/chunks/7284.js:1:147834:       1 │ ...1:return em(a,2790,2799,!0,d);case 22:return em(a,2662,2671,!0,d...         ╵                                  ~~~~ |
| Chat Core and SSE Streaming | Bundle Size | /chat, /api/v1/chat, /api/v1/chat-stream | — | — | — | — | — | — | n/a | chunks 1.06 MB, build 1.11 GB | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Bundle Size | /chat, /api/v1/live-token, /api/v1/stt, /api/v1/tts | — | — | — | — | — | — | n/a | chunks 1.06 MB, build 1.11 GB | P0 | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | app/chat/page.tsx | 1.164 | 1.376 | 3.338 | 1.382 | 0.762 | 3.338 | ΔRSS 65 MB / peak 168 MB | n/a | P0 | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | components/chat/ChatPageShell.tsx | 0.814 | 0.877 | 0.917 | 0.835 | 0.772 | 0.917 | ΔRSS 480 KB / peak 168 MB | n/a | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useGeminiLive.ts | 0.826 | 0.868 | 0.901 | 0.839 | 0.793 | 0.901 | ΔRSS 336 KB / peak 169 MB | n/a | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useVoiceStateMachine.ts | 1.103 | 1.165 | 1.954 | 1.193 | 1.041 | 1.954 | ΔRSS 480 KB / peak 169 MB | n/a | P0 | completed | — |
