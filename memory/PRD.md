# missiAI — Product Requirements Document

## Original Problem Statement
Replace flat KV memory with a real vector-based Life Graph — the foundational system that makes missiAI feel like JARVIS. Current memory is a flat string in Cloudflare KV. Goal: a living knowledge graph of the user's entire life — people, goals, habits, events, preferences, emotions — retrieved by semantic relevance, not keyword match.

## Architecture
- **Platform**: Next.js on Cloudflare Pages
- **Auth**: Clerk
- **Storage**: Cloudflare KV (MISSI_MEMORY) + Cloudflare Vectorize (LIFE_GRAPH)
- **Embeddings**: Gemini text-embedding-004 (768 dimensions)
- **AI**: Gemini 2.5 Flash (chat), Gemini 2.0 Flash Lite (extraction)
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

## What's Been Implemented (2026-02-current)

### Bug Fix — Memory Not Persisting After Tab Close
- **Root Cause 1**: `saveMemoryBeacon` was NOT sending `interactionCount` — server received 0, condition `interactionCount > 0` failed → NO extraction ever on tab close
- **Root Cause 2**: Extraction threshold was every 5th interaction — too high for short sessions
- **Fix 1** (`hooks/useVoiceStateMachine.ts`): `saveMemoryBeacon` now includes `interactionCount` in payload
- **Fix 2** (`app/api/v1/memory/route.ts`): Extraction now triggers at `interactionCount >= 2` (was every 5th)

## What's Been Implemented (2026-03-31)
- [x] types/memory.ts — Complete rewrite with LifeNode, LifeGraph, MemorySearchResult
- [x] lib/memory/embeddings.ts — Gemini embedding generation + cosine similarity
- [x] lib/memory/vectorize.ts — Cloudflare Vectorize operations
- [x] lib/memory/life-graph.ts — Main Life Graph CRUD with KV fallback
- [x] lib/memory/graph-extractor.ts — Extract life nodes via Gemini Flash
- [x] app/api/v1/memory/route.ts — Updated GET/POST with Life Graph
- [x] app/api/v1/chat/route.ts — Replaced old memory with Life Graph search
- [x] lib/validation/schemas.ts — Added interactionCount to memorySchema
- [x] services/ai.service.ts — Fixed buildSystemPrompt double-wrapping
- [x] wrangler.toml — Added Vectorize binding
- [x] scripts/setup-vectorize.sh — Vectorize index creation script
- [x] 140/140 tests passing (95 new + 45 existing)

## Prioritized Backlog
### P0
- Deploy and create Vectorize index in production

### P1
- Wire frontend memory.service.ts to send interactionCount
- Memory dashboard UI to browse Life Graph nodes

### P2
- Relationship edges between LifeNodes
- Memory decay / confidence degradation over time
- Bulk import (user can add facts explicitly)
- Memory export/delete for GDPR compliance

## Next Tasks
1. Production deployment + Vectorize index setup
2. Frontend integration (interactionCount in POST body)
3. Memory Insights UI panel
