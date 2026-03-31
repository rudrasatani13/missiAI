# MissiAI - PRD & Implementation Log

## Original Problem Statement
Add emotional voice intelligence — detect user mood from voice tone and adapt missi's response style, length, and TTS voice in real-time.

## Architecture
- **Platform**: Next.js 16 (edge runtime, Cloudflare Pages)
- **AI**: Gemini 3 Flash Preview for chat, ElevenLabs for TTS/STT
- **Auth**: Clerk
- **Memory**: Cloudflare KV + Vectorize for life graph

## Core Requirements
1. Detect emotion from audio frequency/time-domain data (client-side, pure math)
2. Map emotions to response adaptations (length, tone, TTS params, token limits)
3. Smooth emotion readings to prevent flickering
4. Pass emotion context through to AI (system prompt suffix) and TTS (stability/style params)
5. Visual indicator (dot) during recording showing detected emotion

## What's Been Implemented

### Phase 1: Emotion Detection Feature (2026-03-31)
- **types/emotion.ts**: EmotionState (8 states), EmotionProfile, EmotionAdaptation types
- **lib/client/emotion-detector.ts**: Pure math detectEmotionFromAudio() and getEmotionAdaptation()
- **hooks/useEmotionDetector.ts**: React hook with history-based smoothing
- **hooks/useVoiceStateMachine.ts**: Integrated emotion detection into voice flow
- **lib/validation/schemas.ts**: Added optional TTS params and chat params
- **lib/ai/gemini-stream.ts**: buildGeminiRequest accepts optional maxOutputTokens
- **app/api/v1/tts/route.ts**: Passes emotion-adapted TTS params to ElevenLabs
- **app/api/v1/chat/route.ts**: Reads maxOutputTokens and client memories
- **components/chat/StatusDisplay.tsx**: 6px emotion indicator dot
- **app/chat/page.tsx**: Passes currentEmotion to StatusDisplay
- **Tests**: 12 new tests (8 detector + 4 hook) - all passing

### Phase 2: Bug Fixes (2026-03-31)
- **Fix "Failed to get response"**: Removed .max(10000) limit on memories schema field
- **Fix silent TTS failure**: Added error message + 2s delay when TTS fails in continuous mode
- **Fix empty AI response**: Added "Couldn't generate a response" error message
- **Fix wrong/irrelevant responses**: Updated all 4 personality prompts — Google Search now only triggers for explicit factual data requests, NOT for personal questions, advice, or "what should I do" questions
- **Fix emotion overriding user intent**: Emotion suffixes now include "Always address what the user actually asked about"
- Full test suite: 179/179 passing

## Prioritized Backlog
### P0 (Critical) - None remaining

### P1 (Important)
- Emotion history analytics/dashboard
- Persistent emotion calibration per user
- STT timeout increase for very long recordings (>30s audio)

### P2 (Nice to Have)
- Visual emotion waveform overlay during recording
- Emotion-based voice selection (different ElevenLabs voices per emotion)
- Emotion trend tracking across sessions

## Next Tasks
- User testing to validate Google Search behavior with updated prompts
- Monitor TTS failure rates in production
- Consider increasing STT_TIMEOUT from 20s for longer recordings
