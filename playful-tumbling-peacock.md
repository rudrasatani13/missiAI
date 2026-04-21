# EDITH Mode: Voice-First Autonomous Agent for Missi

## Context

Missi is a voice assistant but currently the voice path (`/api/v1/chat`) has **zero agent capabilities** — tool calling only works via `/api/v1/chat-stream` which the voice UI doesn't use. The user wants Missi to work like Tony Stark's EDITH: fully autonomous, voice-only, no typing. User says a task → Missi asks follow-ups via voice → executes in background → speaks results → notifies when async tasks complete.

**Critical gap discovered**: `useVoiceStateMachine.ts:574` calls `/api/v1/chat` (no agent loop), while all tool-calling logic lives in `/api/v1/chat-stream/route.ts`. Voice users currently get ZERO agent tools.

---

## Phase 1: Wire Voice to Agent Loop (Foundation)

### 1.1 — Point voice at the agentic endpoint
- **File**: `hooks/useVoiceStateMachine.ts` (line 574)
- Change `/api/v1/chat` → `/api/v1/chat-stream`
- Parse new SSE events: `agentStep`, `audio`, `needsInput` alongside existing `text`
- Handle agent step visualization during voice mode (already supported via `AgentSteps.tsx`)

### 1.2 — Increase agent loop capacity
- **File**: `app/api/v1/chat-stream/route.ts` (line 31)
- `MAX_AGENT_LOOPS`: 3 → 8
- Add `MAX_TOTAL_TOOL_CALLS = 12` hard cap across all loops
- Add 45s per-request timeout safety net

### 1.3 — Voice-native confirmation (replace UI dialogs)
- **File**: `lib/ai/agent-confirm.ts`
- Add `voiceMode: boolean` flag to chat request body
- When `voiceMode=true`, skip HMAC token confirmation flow
- Agent verbally confirms before destructive actions: "Sir, mail bhej rahi hu Rahul ko. Bhej du?"
- Next voice turn with "haan/yes/bhej do" → executes; "nahi/cancel" → aborts

### 1.4 — Continuous conversation for slot-filling
- **File**: `hooks/useVoiceStateMachine.ts`
- After Missi finishes speaking a question, auto-re-enter recording state
- Add `expectingResponse` flag: extends silence timeout from 1.5s → 4s when agent asked a question
- Parse `{ needsInput: true }` SSE event from server to trigger this

---

## Phase 2: EDITH System Prompt

### 2.1 — New EDITH personality mode
- **File**: `services/ai.service.ts` — `buildSystemPrompt()`
- Add `edithMode: boolean` parameter
- When active, append EDITH behavioral rules to system prompt:
  ```
  You are Missi in EDITH mode — fully autonomous voice agent.
  - EXECUTE tasks immediately. Don't ask "should I...?" — just do it.
  - Missing parameters? Ask ONE question at a time: "Kise bhejna hai sir?"
  - Status updates: "Ek second sir, dhundh rahi hu..."
  - After execution: "Ho gaya sir, [result]"
  - Hindi/Hinglish conversational style with "Sir/Ma'am"
  - Chain tools autonomously: search → summarize → speak
  ```

### 2.2 — Auto-activate EDITH mode for voice
- **File**: `app/api/v1/chat-stream/route.ts`
- When request has `voiceEnabled: true` or `voiceMode: true`, auto-inject EDITH prompt
- Increase `maxOutputTokens` to 800 for voice mode (longer tool explanations)

---

## Phase 3: New Agent Tools

### 3.1 — Email sending (Resend)
- **New dep**: `resend` (edge-compatible REST API, 3000 emails/mo free)
- **File**: `lib/ai/agent-tools.ts` — add `sendEmail` tool
- Parameters: `to`, `subject`, `body`, `replyTo`
- Calls `POST https://api.resend.com/emails`
- From: `missi@missi.space` (verified domain)
- **Env**: Add `RESEND_API_KEY`

### 3.2 — Contact store (for name → email resolution)
- **New file**: `lib/contacts/contact-store.ts`
- KV key: `contacts:{userId}` → `[{ name, email, phone?, relation? }]`
- **New tools in `agent-tools.ts`**: `lookupContact`, `saveContact`
- Enables: "Send email to Rahul" → auto-resolve to rahul@example.com

### 3.3 — Enhanced search tools
- **File**: `lib/ai/agent-tools.ts`
- **`searchWeb` enhancement**: Add `platform` param ("general"|"news"|"twitter"|"reddit"|"youtube")
  - Appends `site:twitter.com`, `site:reddit.com` etc to Gemini search query
  - Reuses existing Google Search grounding — no new API keys needed
- **New tool `searchNews`**: NewsAPI.org `top-headlines` endpoint → `NEWSAPI_KEY`
- **New tool `searchYouTube`**: YouTube Data API v3 search → `YOUTUBE_API_KEY`

### 3.4 — More calendar operations
- **File**: `lib/ai/agent-tools.ts`
- Add: `updateCalendarEvent`, `deleteCalendarEvent`, `findFreeSlot`
- Reuse existing Google Calendar OAuth tokens from `data-fetcher.ts`

---

## Phase 4: Background Tasks + Push Notifications

### 4.1 — KV-based task queue
- **New files**:
  - `lib/tasks/task-types.ts` — `BackgroundTask` interface
  - `lib/tasks/task-store.ts` — KV CRUD (`task:{taskId}`, `task-queue:{userId}`)
  - `lib/tasks/task-runner.ts` — execute tasks from queue
- **New API**: `app/api/v1/tasks/route.ts` — list/poll tasks
- **New API**: `app/api/v1/tasks/[taskId]/route.ts` — get task status
- Task lifecycle: `PENDING → RUNNING → COMPLETED | FAILED`

### 4.2 — Client-side task polling
- **New hook**: `hooks/useTaskPoller.ts`
- Polls `/api/v1/tasks` every 5s when active tasks exist
- On completion: speak result via TTS if chat page open, else push notification

### 4.3 — Edge-compatible push notifications
- **New file**: `lib/push/edge-web-push.ts`
- Implement VAPID JWT signing with `crypto.subtle` (ES256, P-256)
- Replace placeholder in `app/api/push/trigger/route.ts`
- `web-push` npm package doesn't work on Edge — this is the custom implementation

### 4.4 — Reminder delivery
- **New API**: `app/api/cron/reminders/route.ts`
- Cron-triggered (Cloudflare Cron or external)
- Scans KV for due reminders → sends push notification
- **New file**: `lib/time/time-parser.ts` — parse natural language times to timestamps

---

## Phase 5: Gemini Live + Tool Calling (Advanced)

### 5.1 — Add tools to Gemini Live WebSocket
- **File**: `hooks/useGeminiLive.ts` (setup config ~line 304)
- Add `tools: [{ google_search: {} }, { function_declarations: AGENT_FUNCTION_DECLARATIONS }]`
- Handle `toolCall` WebSocket messages → execute via new `/api/v1/tools/execute` endpoint
- Send `toolResponse` back over WebSocket → model continues speaking with results

### 5.2 — Tool execution endpoint
- **New API**: `app/api/v1/tools/execute/route.ts`
- Authenticated endpoint, reuses `executeAgentTool` from `agent-tools.ts`
- Returns tool result as JSON

---

## Implementation Order (Priority)

| Sprint | What | Files |
|--------|------|-------|
| **1** | Wire voice → agent loop + EDITH prompt | `useVoiceStateMachine.ts`, `chat-stream/route.ts`, `ai.service.ts` |
| **2** | Email + contacts + enhanced search | `agent-tools.ts`, `contact-store.ts` (new), add Resend |
| **3** | Background tasks + push notifications | `lib/tasks/*` (new), `lib/push/*` (new), `hooks/useTaskPoller.ts` |
| **4** | More calendar ops + reminder delivery | `agent-tools.ts`, `cron/reminders/route.ts` |
| **5** | Gemini Live + tool calling | `useGeminiLive.ts`, `tools/execute/route.ts` |

---

## Verification Plan

1. **Voice → Agent tools**: Say "Hey Missi, aaj ka weather kya hai?" → should trigger `searchWeb` tool and speak results
2. **Slot filling**: Say "Send email to Rahul" → Missi asks "Kise bhejna hai sir?" → speak email → asks subject → asks body → sends
3. **Background task**: Start a long search → task goes to background → push notification when done
4. **Multi-tool chain**: "Find me latest news about AI" → `searchNews` → summarize → speak results
5. **Gemini Live + tools**: In live mode, ask factual question → model calls search tool → speaks answer in real-time

---

## Key Files to Modify

| File | Change |
|------|--------|
| `hooks/useVoiceStateMachine.ts:574` | `/api/v1/chat` → `/api/v1/chat-stream` + parse agent SSE events |
| `app/api/v1/chat-stream/route.ts:31` | `MAX_AGENT_LOOPS` 3→8, add voice mode, EDITH prompt injection |
| `lib/ai/agent-tools.ts` | Add sendEmail, lookupContact, saveContact, searchNews, searchYouTube, calendar ops |
| `services/ai.service.ts` | Add EDITH mode system prompt |
| `lib/ai/agent-confirm.ts` | Voice-native confirmation (skip HMAC for voice mode) |
| `hooks/useGeminiLive.ts` | Add tool declarations + handle toolCall messages |

## New Files

| File | Purpose |
|------|---------|
| `lib/contacts/contact-store.ts` | KV-based contact name→email resolution |
| `lib/tasks/task-types.ts` | BackgroundTask interface |
| `lib/tasks/task-store.ts` | KV CRUD for task queue |
| `lib/tasks/task-runner.ts` | Task execution logic |
| `lib/push/edge-web-push.ts` | VAPID push on Cloudflare Edge |
| `lib/time/time-parser.ts` | Natural language → timestamp parsing |
| `hooks/useTaskPoller.ts` | Client-side task status polling |
| `app/api/v1/tasks/route.ts` | Task list/poll endpoint |
| `app/api/v1/tasks/[taskId]/route.ts` | Task status endpoint |
| `app/api/v1/tools/execute/route.ts` | Single tool execution for Gemini Live |
| `app/api/cron/reminders/route.ts` | Cron-triggered reminder delivery |
