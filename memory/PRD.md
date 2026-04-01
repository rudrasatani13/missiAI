# missiAI — Product Requirements Document

## Architecture
- Next.js 16 + Cloudflare Pages (edge runtime) + Clerk Auth + Cloudflare KV + Gemini AI (gemini-3-flash-preview)
- ElevenLabs STT (Scribe v2 auto-detect) + ElevenLabs TTS (Turbo v2.5)

## What's Been Implemented

### Session 1: Action Engine
- types/actions.ts, lib/actions/intent-detector.ts, action-executor.ts, action-registry.ts
- app/api/v1/actions/route.ts (POST + GET), hooks/useActionEngine.ts
- components/chat/ActionCard.tsx (z-50 fixed overlay), lib/validation/schemas.ts (actionSchema)
- 44 new tests across 3 test files

### Session 2: Voice Bug Fixes
- Silence detection: SPEECH_THRESH 0.04, SILENCE_THRESH 0.025, consecutive frame counting
- No-speech timeout (5s), STT auto-detect language, TTS truncation 5 sentences/1200 chars

### Session 3: Memory + ActionCard Fixes
- kvFallbackSearch: Only keyword-matched memories returned (no irrelevant injection)
- ActionCard: Fixed z-50 overlay container

### Session 4: Response Truncation + Error Recovery
- maxOutputTokens: stressed/frustrated/fatigued 300→800, neutral/happy/excited 600→1000, confident 1200
- Chat route default 600→1000
- Error recovery: pop failed user message, stop continuous mode on persistent failure
- Conversation cap 20→14 messages

### Test Status: 223/223 tests pass (19 test files)

## Prioritized Backlog
- P1: Action history view in Settings
- P1: Undo support for reminders/notes
- P2: Action chaining, Quick Actions suggestion bar
- P2: Visual noise level indicator
