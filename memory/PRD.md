# missiAI — Product Requirements Document

## Original Problem Statement
Build autonomous action engine — missiAI detects user intent and executes real actions, not just talks about them. Support 8 action types (web_search, draft_email, draft_message, set_reminder, take_note, calculate, translate, summarize) with intent detection via Gemini AI, safe math parsing, KV storage for reminders/notes, and a floating ActionCard UI component.

## Architecture
- **Stack**: Next.js 16 + Cloudflare Pages (edge runtime) + Clerk Auth + Cloudflare KV + Gemini AI
- **AI Service**: `callAIDirect()` from `services/ai.service.ts` — uses gemini-3-flash-preview (DO NOT change)
- **KV Storage**: `MISSI_MEMORY` binding for reminders/notes persistence
- **Auth**: Clerk via `getVerifiedUserId()` from `lib/server/auth.ts`

## User Personas
- Voice-first users who want to take quick actions via speech
- Users who need drafts, calculations, translations, and reminders without leaving the chat

## Core Requirements (Static)
1. Intent detection with confidence threshold (>= 0.75)
2. 8 action types + none (regular conversation)
3. Safe math parsing without eval()
4. KV storage for reminders and notes
5. ActionCard UI with glass-morphism, auto-dismiss, slide animation
6. API route with POST (detect+execute) and GET (saved items)

## What's Been Implemented (Jan 2026)
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
- [x] All 223 tests passing (19 test files)

## Prioritized Backlog
- **P0**: None — all core requirements implemented
- **P1**: Action confirmation dialog before execution
- **P1**: Action history view in Settings panel
- **P1**: Undo support for set_reminder and take_note
- **P2**: Action chaining (multiple intents per message)
- **P2**: Quick Actions suggestion bar with ACTION_TRIGGERS
- **P2**: Keyboard shortcuts for common actions

## Next Tasks
1. Test with live Gemini API in staging environment
2. Add action history panel
3. Implement undo flow for reminders/notes
