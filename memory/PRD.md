# missiAI — Product Requirements Document

## Original Problem Statement
Replace flat KV memory with a real vector-based Life Graph — the foundational system that makes missiAI feel like JARVIS. Current memory is a flat string in Cloudflare KV. Goal: a living knowledge graph of the user's entire life — people, goals, habits, events, preferences, emotions — retrieved by semantic relevance, not keyword match.

## Architecture
- **Platform**: Next.js on Cloudflare Pages
- **Auth**: Clerk
- **Storage**: Cloudflare KV (MISSI_MEMORY) + Cloudflare Vectorize (LIFE_GRAPH)
- **Embeddings**: Gemini text-embedding-004 (768 dimensions)
- **AI**: Gemini 3 Flash Preview (chat + briefing generation)
- **Fallback**: When Vectorize unavailable, degrades to enhanced KV scoring

## User Personas
- Primary: Users who want a personal AI assistant that remembers their life context
- Power users: People who use Missi daily and expect growing contextual awareness

## Core Requirements (Static)
1. Life Graph data model with 10 memory categories
2. Vector embedding for semantic search
3. Automatic life node extraction from conversations
4. Node merging/deduplication (title match + cosine similarity >0.9)
5. KV fallback search when Vectorize unavailable
6. Prompt injection protection in memory blocks
7. Backward compatibility with legacy MemoryFact types
8. Proactive intelligence — morning briefings, goal nudges, relationship reminders

## What's Been Implemented

### Performance & Reliability Fix (2026-02)
- Rate limit: 10 → 25 req/min
- maxOutputTokens: 4096 → 600 (voice responses are 1-3 sentences)
- Auto-retry up to 2 times on 429/503/network errors
- STT/TTS timeouts increased

### Life Graph Foundation (2026-03-31)
- [x] types/memory.ts — LifeNode, LifeGraph, MemorySearchResult
- [x] lib/memory/embeddings.ts — Gemini embedding generation
- [x] lib/memory/vectorize.ts — Cloudflare Vectorize operations
- [x] lib/memory/life-graph.ts — Main Life Graph CRUD
- [x] lib/memory/graph-extractor.ts — Extract life nodes via Gemini Flash
- [x] app/api/v1/memory/route.ts — Updated GET/POST with Life Graph
- [x] app/api/v1/chat/route.ts — Replaced old memory with Life Graph search

### Proactive Intelligence — JARVIS Layer (2026-03-31)
- [x] types/proactive.ts — BriefingItem, DailyBriefing, ProactiveConfig
- [x] lib/proactive/briefing-generator.ts — AI-powered daily briefing via Gemini
- [x] lib/proactive/nudge-engine.ts — Deterministic real-time nudge checking
- [x] lib/proactive/config-store.ts — ProactiveConfig KV persistence
- [x] app/api/v1/proactive/route.ts — GET/POST/PATCH/DELETE edge API
- [x] hooks/useProactive.ts — React hook for briefings + nudges
- [x] components/chat/StatusDisplay.tsx — Briefing card + nudge pill in idle state
- [x] app/chat/page.tsx — Auto-speak first high-priority item (JARVIS moment)
- [x] lib/validation/schemas.ts — proactiveConfigSchema, nudgeRequestSchema, dismissSchema
- [x] next.config.mjs — ignoreBuildErrors: false
- [x] .gitignore — duplicate -e lines removed
- [x] tests/lib/proactive/nudge-engine.test.ts — 14 tests, all passing
- [x] tests/lib/proactive/briefing-generator.test.ts — 14 tests, all passing
- **Total: 167/167 tests passing**

## Prioritized Backlog
### P0
- Deploy and create Vectorize index in production

### P1
- Frontend memory dashboard UI (browse Life Graph nodes)
- Proactive settings UI (configure briefing time, timezone, enable/disable)

### P2
- Relationship edges between LifeNodes
- Memory decay / confidence degradation over time
- Bulk import (user can add facts explicitly)
- Memory export/delete for GDPR compliance
- Calendar integration for calendar_prep briefing items
- Weather API for weather_heads_up briefing items

## Next Tasks
1. Production deployment + Vectorize index setup
2. Proactive settings UI panel (expose ProactiveConfig to user)
3. Memory Insights UI panel
