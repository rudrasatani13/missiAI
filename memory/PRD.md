# missiAI PRD

## Original Problem Statement
Replace fake chunked streaming in missiAI with Gemini's native `streamGenerateContent` API. The app currently fetches the full Gemini response, then simulates streaming by splitting into 100-char chunks in a ReadableStream.

## Architecture
- **Framework**: Next.js 16 (Cloudflare Edge Runtime)
- **Auth**: Clerk
- **AI Provider**: Google Gemini (gemini-2.5-flash default, user uses gemini-2.5-pro)
- **Storage**: Cloudflare KV for memory
- **Voice**: STT + TTS via custom API routes

## What's Been Implemented (Jan 2026)

### Native Gemini Streaming
- **`/app/lib/gemini-stream.ts`** (NEW): 
  - `buildGeminiRequest()` - constructs Gemini REST body with system prompt, memories, google_search tool
  - `streamGeminiResponse()` - calls `streamGenerateContent?alt=sse`, parses SSE, returns `ReadableStream<string>` of text deltas
  - API key passed via `x-goog-api-key` header (NOT URL param) - fixes key exposure vulnerability
  - Handles partial SSE lines with line buffer, multiple text parts per candidate

- **`/app/app/api/chat/route.ts`** (REWRITTEN):
  - Removed all fake chunking logic (100-char chunk splitting)
  - Uses `buildGeminiRequest` + `streamGeminiResponse` for native streaming
  - Transforms text deltas into SSE format (`data: {"text":"..."}\n\n`) for client
  - Headers: `text/event-stream`, `no-cache`, `X-Accel-Buffering: no`
  - Try/catch returns 500 JSON before stream starts on error
  - Supports `GEMINI_MODEL` env var override

- **`/app/hooks/useVoiceStateMachine.ts`** (UPDATED):
  - New `streamingText` state exposed from hook
  - `getAIResponse` updates `streamingText` on each SSE chunk
  - Clears `streamingText` on completion, empty response, abort, and errors
  - Timeout increased from 10s (CHAT_TIMEOUT) to 60s (STREAM_CHAT_TIMEOUT)

- **`/app/app/chat/page.tsx`** (UPDATED):
  - Displays `streamingText` during `thinking` state with blinking cursor
  - `data-testid="streaming-text-display"` and `data-testid="streaming-cursor"`
  - Blink CSS animation for cursor

- **`/app/lib/fetch-with-timeout.ts`** (UPDATED):
  - Added `STREAM_CHAT_TIMEOUT = 60_000`

## Core Requirements (Static)
- Edge runtime compatible (no Node.js-only APIs)
- Clerk auth for all API routes
- Rate limiting per user
- Server-side memory fetch from KV (never trust client)
- Memory sanitization against prompt injection

## User Personas
- Voice-first AI companion users
- Hindi/Hinglish speaking users getting English responses

## Prioritized Backlog
- P0: None (streaming implementation complete)
- P1: Add text chat mode alongside voice
- P2: Multi-provider streaming (OpenAI, Claude) 
- P3: Client-side token counting for cost estimation

## Next Tasks
- Deploy to Cloudflare with GEMINI_API_KEY configured
- Set GEMINI_MODEL=gemini-2.5-pro in production env if desired
- Test end-to-end streaming with real Gemini API key
