# Latest Benchmark Run

Generated: 2026-05-02T11:51:16.175Z
Run ID: feature-bench-2026-05-02T11-47-59-274Z
Selected features: chat-core, voice-live, exam-buddy, agents-actions
Baseline mode: no
Base URL: http://127.0.0.1:3000

## Summary
- Completed: 13
- Skipped: 18
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
| Exam Buddy | Http Route Latency | http://127.0.0.1:3000/exam-buddy | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Exam Buddy | Api Latency | http://127.0.0.1:3000/api/v1/exam-buddy/profile | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Exam Buddy | Api Latency | http://127.0.0.1:3000/api/v1/exam-buddy/quiz | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Exam Buddy | Mocked Integration Benchmark | lib/exam-buddy/quiz-generator.ts#generateQuizWithDiagnostics | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Fixture module not found yet: benchmarks/fixtures/exam-buddy/quiz-generator.fixture.ts |
| Agents, Actions, and Tool Execution | Http Route Latency | http://127.0.0.1:3000/agents | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Agents, Actions, and Tool Execution | Api Latency | http://127.0.0.1:3000/api/v1/actions | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Agents, Actions, and Tool Execution | Api Latency | http://127.0.0.1:3000/api/v1/agents/history | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Auth-required target skipped because no benchmark auth headers or cookies were supplied. |
| Agents, Actions, and Tool Execution | Mocked Integration Benchmark | lib/actions/action-executor.ts#executeAction | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Fixture module not found yet: benchmarks/fixtures/agents/action-executor.fixture.ts |
| Workspace Build Pipeline | Build Time | pnpm run build | 124435.000 | 124435.000 | 124435.000 | 124435.000 | 124435.000 | 124435.000 | n/a | chunks 0 B, build 1.05 GB | P0 | completed | Build completed successfully. \| warn - If this is content and not a class, replace it with `ease-&lsqb;cubic-bezier(0.22,1,0.36,1)&rsqb;` to silence this warning.   ⚠ The Next.js plugin was not detected in your ESLint configuration. See https://nextjs.org/docs/app/api-reference/config/eslint#migrating-existing-config |
| Workspace Build Pipeline | Build Time | pnpm run build:cf | 70850.000 | 70850.000 | 70850.000 | 70850.000 | 70850.000 | 70850.000 | n/a | chunks 0 B, build 1.11 GB | P0 | completed | Build completed successfully. \| .open-next/server-functions/default/.next/server/chunks/7284.js:1:147834:       1 │ ...1:return em(a,2790,2799,!0,d);case 22:return em(a,2662,2671,!0,d...         ╵                                  ~~~~ |
| Chat Core and SSE Streaming | Bundle Size | /chat, /api/v1/chat, /api/v1/chat-stream | — | — | — | — | — | — | n/a | chunks 1.06 MB, build 1.11 GB | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Bundle Size | /chat, /api/v1/live-token, /api/v1/stt, /api/v1/tts | — | — | — | — | — | — | n/a | chunks 1.06 MB, build 1.11 GB | P0 | completed | — |
| Exam Buddy | Bundle Size | /exam-buddy, /api/v1/exam-buddy/profile, /api/v1/exam-buddy/quiz | — | — | — | — | — | — | n/a | chunks 1014 KB, build 1.11 GB | P1 | completed | — |
| Agents, Actions, and Tool Execution | Bundle Size | /agents, /chat, /api/v1/agents/[...path], /api/v1/actions | — | — | — | — | — | — | n/a | chunks 1.06 MB, build 1.11 GB | P1 | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | app/chat/page.tsx | 1.164 | 1.376 | 3.338 | 1.382 | 0.762 | 3.338 | ΔRSS 65 MB / peak 168 MB | n/a | P0 | completed | — |
| Chat Core and SSE Streaming | Render Import Cost | components/chat/ChatPageShell.tsx | 0.814 | 0.877 | 0.917 | 0.835 | 0.772 | 0.917 | ΔRSS 480 KB / peak 168 MB | n/a | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useGeminiLive.ts | 0.826 | 0.868 | 0.901 | 0.839 | 0.793 | 0.901 | ΔRSS 336 KB / peak 169 MB | n/a | P0 | completed | — |
| Voice, STT, TTS, and Live Relay | Render Import Cost | hooks/chat/useVoiceStateMachine.ts | 1.103 | 1.165 | 1.954 | 1.193 | 1.041 | 1.954 | ΔRSS 480 KB / peak 169 MB | n/a | P0 | completed | — |
| Exam Buddy | Render Import Cost | components/exam-buddy/ExamBuddyHub.tsx | 0.829 | 0.866 | 0.875 | 0.836 | 0.796 | 0.875 | ΔRSS 208 KB / peak 169 MB | n/a | P1 | completed | — |
| Exam Buddy | Render Import Cost | components/exam-buddy/QuizView.tsx | — | — | — | — | — | — | n/a | n/a | P1 | skipped | Import benchmark skipped because the module is not safe to load in the Node benchmark runtime: Invalid or unexpected token |
| Agents, Actions, and Tool Execution | Render Import Cost | components/agents/AgentDashboard.tsx | 0.574 | 0.617 | 0.711 | 0.598 | 0.549 | 0.711 | ΔRSS 80 KB / peak 170 MB | n/a | P1 | completed | — |
| Agents, Actions, and Tool Execution | Render Import Cost | hooks/chat/useActionEngine.ts | 0.618 | 0.633 | 0.703 | 0.626 | 0.562 | 0.703 | ΔRSS 160 KB / peak 170 MB | n/a | P1 | completed | — |
