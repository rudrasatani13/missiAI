# missiAI - Current Product Scope

## Overview
missiAI is a chat-first AI companion with voice, saved memory, messaging bot foundations, billing, and secure admin/health operations.

## Architecture
- **Frontend**: Next.js 15 (React, TypeScript)
- **Auth**: Clerk
- **Storage**: Cloudflare KV (`MISSI_MEMORY`) + Cloudflare Vectorize (`LIFE_GRAPH`)
- **Billing**: Dodo Payments (Plus & Pro subscriptions)
- **Deployment**: OpenNext Cloudflare + custom worker entry
- **AI**: Gemini via Vertex AI (chat, STT, TTS, Gemini Live)

## Kept Features

- **Core chat**: authenticated chat, guest chat, streaming responses, and action surfaces.
- **Voice**: STT, TTS, Gemini Live relay, and the main voice UI.
- **Saved memory**: memory extraction, storage, search, filtering, deletion, prompt grounding, and export.
- **Messaging bots**: WhatsApp and Telegram linking/webhook foundations.
- **Billing core**: Dodo checkout, subscriptions, pricing, webhooks, and plan checks.
- **Integrations**: Google Calendar, Notion, plugin refresh, and safe tool execution.
- **Daily brief/proactive**: current daily brief and proactive nudge surfaces.
- **Operations**: auth, security, admin analytics, health checks, observability, and AI spend controls.

## Backlog / Future
- P1: Subscription status sync cron job
- P1: Email notifications for payment events
- P2: Billing analytics admin dashboard
