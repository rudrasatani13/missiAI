# missiAI - Product Requirements Document

## Original Problem Statement
Fix stability and crash vulnerabilities in missiAI — a Next.js voice assistant app using Clerk auth, Gemini (chat), ElevenLabs (TTS + STT), with THREE.js particle visualizer.

## Architecture
- **Framework**: Next.js 16 (App Router) + TypeScript
- **Auth**: Clerk
- **AI**: Gemini (chat), ElevenLabs (TTS/STT)
- **Visualization**: THREE.js particle system
- **Storage**: Cloudflare KV (memory), localStorage (personality)
- **Voice State Machine**: idle -> recording -> transcribing -> thinking -> speaking

## What's Been Implemented (Jan 2026)

### Stability Fixes
1. **`lib/fetch-with-timeout.ts`** - Fetch utility with AbortController-based timeout, merges caller signals. Constants: CHAT_TIMEOUT=10s, TTS_TIMEOUT=15s, STT_TIMEOUT=10s
2. **`lib/browser-support.ts`** - Browser capability checks: `checkVoiceSupport()` and `getBestAudioMimeType()` with MIME priority detection
3. **`hooks/useVoiceStateMachine.ts`** - Extracted all voice state logic from monolithic chat/page.tsx into a custom hook with:
   - Single abortControllerRef (cancelled before every state transition)
   - isTransitioning guard to prevent concurrent transitions
   - try/catch/finally on every async operation (always resets to idle on error)
   - fetchWithTimeout for all external API calls
   - getBestAudioMimeType() for MediaRecorder initialization
   - Exposed API: state, startRecording, stopRecording, cancelAll, handleTap, greet, saveMemoryBeacon
4. **sendBeacon fix** - Payload size check (<60KB), truncates to last 6 messages if over limit
5. **beforeunload + visibilitychange** - Dual event listeners for memory save reliability
6. **package.json** - Name changed from "my-v0-project" to "missiai"
7. **.gitignore** - Added .idea/ entry

## Backlog
- P0: None
- P1: Extract ParticleVisualizer into its own component file
- P2: Add offline/reconnection handling
- P2: Add voice support detection UI feedback (show message if browser unsupported)

## Next Tasks
- User review of refactored code
- Integration testing with live Gemini/ElevenLabs APIs
