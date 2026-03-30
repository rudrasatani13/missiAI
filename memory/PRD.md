# Missi AI — PRD & Progress Tracker

## Original Problem Statement
Replace flat KV memory string with a structured, cost-efficient memory architecture.
- **Current state**: entire memory = one big string in KV, re-summarized after EVERY interaction
- **Goal**: store individual facts, inject only relevant ones, summarize every 5th turn only

## Architecture
- **Platform**: Next.js on Cloudflare Pages with KV bindings
- **AI Provider**: Gemini (Flash for extraction, configurable model for chat)
- **Auth**: Clerk
- **Storage**: Cloudflare KV (`MISSI_MEMORY` binding)

## Core Requirements
1. `types/memory.ts` — MemoryFact + UserMemoryStore interfaces
2. `lib/kv-memory.ts` — Structured store CRUD + relevance scoring + prompt formatting
3. `lib/memory-extractor.ts` — Gemini Flash extraction every 5th interaction
4. `app/api/memory/route.ts` — Structured store endpoints (GET full store, POST with conditional extraction)
5. `app/api/chat/route.ts` — Relevant-facts-only injection into system prompt

## What's Been Implemented (2026-03-30)
- **types/memory.ts**: MemoryFact (id, text, tags, createdAt, accessCount) + UserMemoryStore (facts, lastExtractedAt, interactionCount)
- **lib/kv-memory.ts**: getUserMemoryStore, saveUserMemoryStore (sanitize + cap 50), getRelevantFacts (tag scoring + accessCount bonus + fallback), formatFactsForPrompt ([MEMORY START/END] block)
- **lib/memory-extractor.ts**: extractMemoryFacts — calls Gemini Flash on last 6 messages, JSON-only response, dedup via includes(), cap 50
- **app/api/memory/route.ts**: POST increments interactionCount, conditionally extracts every 5th; GET returns full UserMemoryStore
- **app/api/chat/route.ts**: Replaced getUserMemories() with getUserMemoryStore → getRelevantFacts → formatFactsForPrompt pipeline
- **nanoid@3**: Installed for 8-char ID generation
- All tests pass (17/17) — TypeScript compilation clean

## Backlog
- P2: Remove dead `services/memory.service.ts` (old extraction service, no longer imported)
- P2: Consider persisting updated accessCounts after chat route reads (currently only in-memory mutation)
- P3: Upgrade relevance scoring with embeddings or TF-IDF if tag matching proves insufficient
