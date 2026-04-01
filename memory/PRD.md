# missiAI — Product Requirements Document

## Original Problem Statement
Build autonomous action engine — missiAI detects user intent and executes real actions, not just talks about them. Support 8 action types with intent detection via Gemini AI, safe math parsing, KV storage, and floating ActionCard UI.

## Architecture
- **Stack**: Next.js 16 + Cloudflare Pages (edge runtime) + Clerk Auth + Cloudflare KV + Gemini AI
- **AI Service**: `callAIDirect()` from `services/ai.service.ts` — uses gemini-3-flash-preview (DO NOT change)
- **KV Storage**: `MISSI_MEMORY` binding for reminders/notes persistence
- **Auth**: Clerk via `getVerifiedUserId()` from `lib/server/auth.ts`
- **Voice**: ElevenLabs STT (Scribe v2 auto-detect) + ElevenLabs TTS (Turbo v2.5)

## What's Been Implemented

### Session 1: Action Engine (Jan 2026)
- [x] types/actions.ts, lib/actions/intent-detector.ts, action-executor.ts, action-registry.ts
- [x] app/api/v1/actions/route.ts (POST + GET), hooks/useActionEngine.ts
- [x] components/chat/ActionCard.tsx, lib/validation/schemas.ts (actionSchema)
- [x] 44 new tests across 3 test files

### Session 2: Voice Bug Fixes (Jan 2026)
- [x] Silence detection thresholds raised (SPEECH_THRESH 0.04, SILENCE_THRESH 0.025)
- [x] Consecutive frame counting + NO_SPEECH_MS (5s) timeout
- [x] STT auto-detect language (removed hardcoded Hindi)
- [x] TTS truncation: 5 sentences / 1200 chars

### Session 3: Memory + ActionCard Fixes (Jan 2026)
- [x] kvFallbackSearch: Only return keyword-matched memories (removed "recent memory" fallback)
- [x] emotionalWeight/confidence boosts only apply WITH keyword matches
- [x] Short words (<=2 chars) filtered from query words
- [x] Minimum score threshold >= 2 for returned results
- [x] ActionCard: Moved to fixed z-50 overlay container
- [x] useActionEngine: Better error handling with console.warn

### Test Status: 223/223 tests pass (19 test files)

## Prioritized Backlog
- **P1**: Action history view in Settings panel
- **P1**: Undo support for set_reminder and take_note
- **P2**: Action chaining (multiple intents per message)
- **P2**: Quick Actions suggestion bar
- **P2**: Visual noise level indicator for mic input
