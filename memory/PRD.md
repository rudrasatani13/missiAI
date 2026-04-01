# missiAI — Product Requirements Document

## Original Problem Statement
Build autonomous action engine — missiAI detects user intent and executes real actions, not just talks about them. Support 8 action types (web_search, draft_email, draft_message, set_reminder, take_note, calculate, translate, summarize) with intent detection via Gemini AI, safe math parsing, KV storage for reminders/notes, and a floating ActionCard UI component.

## Architecture
- **Stack**: Next.js 16 + Cloudflare Pages (edge runtime) + Clerk Auth + Cloudflare KV + Gemini AI
- **AI Service**: `callAIDirect()` from `services/ai.service.ts` — uses gemini-3-flash-preview (DO NOT change)
- **KV Storage**: `MISSI_MEMORY` binding for reminders/notes persistence
- **Auth**: Clerk via `getVerifiedUserId()` from `lib/server/auth.ts`
- **Voice**: ElevenLabs STT (Scribe v2 auto-detect) + ElevenLabs TTS (Turbo v2.5)

## User Personas
- Voice-first users who want to take quick actions via speech
- Users who need drafts, calculations, translations, and reminders without leaving the chat
- Multilingual users (Hindi, English, Hinglish)

## Core Requirements (Static)
1. Intent detection with confidence threshold (>= 0.75)
2. 8 action types + none (regular conversation)
3. Safe math parsing without eval()
4. KV storage for reminders and notes
5. ActionCard UI with glass-morphism, auto-dismiss, slide animation
6. API route with POST (detect+execute) and GET (saved items)
7. Robust silence detection for noisy environments
8. Auto-detect language in STT (not hardcoded to Hindi)
9. Full response delivery via TTS (5 sentences, 1200 chars)

## What's Been Implemented

### Session 1: Action Engine (Jan 2026)
- [x] `types/actions.ts` — ActionType, ActionIntent, ActionResult, ActionHistory
- [x] `lib/actions/intent-detector.ts` — detectIntent(), isActionable()
- [x] `lib/actions/action-executor.ts` — executeAction() with 8 handlers + safe math parser
- [x] `lib/actions/action-registry.ts` — ACTION_DESCRIPTIONS, getActionLabel(), ACTION_TRIGGERS
- [x] `app/api/v1/actions/route.ts` — POST + GET endpoints (edge runtime)
- [x] `hooks/useActionEngine.ts` — React hook for frontend
- [x] `components/chat/ActionCard.tsx` — Floating glass card with icons, copy, dismiss
- [x] `lib/validation/schemas.ts` — Added actionSchema
- [x] `app/chat/page.tsx` — Integrated useActionEngine + ActionCard
- [x] 3 test files: intent-detector, action-executor, action-registry (44 tests)

### Session 2: Voice Bug Fixes (Jan 2026)
- [x] Silence detection: SPEECH_THRESH 0.015→0.04, SILENCE_THRESH 0.008→0.025
- [x] Consecutive frame counting (12 frames ~200ms) before silence timer
- [x] No-speech timeout (5s) prevents infinite recording loops
- [x] STT language auto-detect (removed hardcoded `hin`)
- [x] TTS truncation: 3 sentences/600 chars → 5 sentences/1200 chars
- [x] Timer cleanup: noSpeechTimer cleared on speech detection and in stopAudioMonitor

### Test Status: 223/223 tests pass (19 test files)

## Prioritized Backlog
- **P0**: None — all core requirements implemented
- **P1**: Action confirmation dialog before execution
- **P1**: Action history view in Settings panel
- **P1**: Undo support for set_reminder and take_note
- **P2**: Action chaining (multiple intents per message)
- **P2**: Quick Actions suggestion bar with ACTION_TRIGGERS
- **P2**: Visual noise level indicator for mic input

## Next Tasks
1. Test with live Gemini API in staging environment
2. Add action history panel
3. Implement undo flow for reminders/notes
4. Fine-tune voice thresholds based on real-world testing
