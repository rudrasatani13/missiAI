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

## What's Been Implemented (2026-03-31)
- **types/emotion.ts**: EmotionState (8 states), EmotionProfile, EmotionAdaptation types
- **lib/client/emotion-detector.ts**: Pure math detectEmotionFromAudio() and getEmotionAdaptation() - RMS energy, frequency bands, zero crossings, emotion mapping
- **hooks/useEmotionDetector.ts**: React hook with history-based smoothing (last 5 readings, 2+ same = confirmed), confidence gating, reset
- **hooks/useVoiceStateMachine.ts**: Integrated emotion detection - audio snapshots in monitor loop, analysis on stop, emotion context in AI request, TTS params in speak
- **lib/validation/schemas.ts**: Added optional stability/similarityBoost/style to ttsSchema, maxOutputTokens/memories to chatSchema
- **lib/ai/gemini-stream.ts**: buildGeminiRequest accepts optional maxOutputTokens (default 600)
- **app/api/v1/tts/route.ts**: Passes emotion-adapted TTS params to ElevenLabs
- **app/api/v1/chat/route.ts**: Reads maxOutputTokens and client memories (emotion context), passes to Gemini
- **components/chat/StatusDisplay.tsx**: 6px emotion indicator dot with color mapping (8 emotions), fade transition
- **app/chat/page.tsx**: Passes currentEmotion from voice state machine to StatusDisplay
- **Tests**: 12 new tests (8 detector + 4 hook) - all passing. Full suite: 179/179 pass

## Prioritized Backlog
### P0 (Critical)
- None remaining

### P1 (Important)
- Emotion history analytics/dashboard
- Persistent emotion calibration per user

### P2 (Nice to Have)
- Visual emotion waveform overlay during recording
- Emotion-based voice selection (different ElevenLabs voices per emotion)
- Emotion trend tracking across sessions

## Next Tasks
- User testing and calibration of emotion thresholds
- Consider adding emotion data to memory/life graph for long-term personality adaptation
