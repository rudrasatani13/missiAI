# missiAI

> Your personal voice AI companion with persistent memory, gamification, and deep integrations.
> Speak naturally in Hindi, English, or Hinglish — Missi remembers everything that matters.

**Live at [missi.space](https://missi.space)**

---

## What it does

- **Remembers you** — extracts and stores key facts from conversations into a knowledge graph, so every interaction builds on the last
- **Speaks and listens** — real-time voice conversations with speech-to-text and text-to-speech, plus real-time streaming via Gemini Live
- **Adapts to you** — multiple personality modes (friendly, professional, creative, coach, custom), emotional awareness, and context-aware responses
- **Tracks your habits** — gamification with streaks, XP, achievements, and an evolving avatar tier system
- **Connects your tools** — Google Calendar, Notion, and a growing plugin ecosystem
- **Proactive check-ins** — push notifications with reminders and context-aware suggestions
- **Wind-down mode** — evening routine features for winding down at night
- **3D memory graph** — visualize your knowledge graph with an interactive Three.js force-directed graph

---

## Tech Stack

| Layer | Technology |
|--------------|----------------------------------------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 3.4, Framer Motion |
| Visualization | Three.js, react-force-graph-3d |
| AI (Chat) | Google Gemini 2.5 Flash, Gemini Live (real-time voice) |
| AI (Memory) | Gemini Flash Lite (fact extraction) |
| Voice | ElevenLabs STT + TTS |
| Auth | Clerk |
| Payments | Dodo Payments (Pro & Business tiers) |
| Storage | Cloudflare KV (memory), Cloudflare Vectorize (embeddings) |
| Deployment | Cloudflare Pages + @cloudflare/next-on-pages |
| Testing | Vitest, ESLint, TypeScript strict mode |

---

## Architecture

missiAI is an edge-first Next.js application deployed on Cloudflare Pages.

**Voice flow:** User speaks → ElevenLabs STT transcribes → transcript sent to Gemini with memory context + personality → response streams back via SSE → ElevenLabs TTS speaks it aloud. For real-time conversations, Gemini Live handles bidirectional audio streaming.

**Memory system:** Every few interactions, Gemini Flash Lite extracts key facts from the conversation and persists them as nodes in a knowledge graph stored in Cloudflare KV (keyed by Clerk user ID). Cloudflare Vectorize provides semantic search over stored memories. The memory graph is visualized as an interactive 3D force-directed graph.

**Plugin system:** OAuth-based integrations (Google Calendar, Notion) fetch context that gets injected into the AI prompt. An action engine lets the AI draft emails, create calendar events, and execute tasks on the user's behalf.

**Gamification:** Daily streaks, XP from various sources (conversations, check-ins, achievements), tier-based avatar evolution (Spark → Ember → Flame → Blaze → Nova → Aura), and an achievement system.

**Security:** Clerk middleware on all non-public routes, dual-layer rate limiting (IP burst + KV-backed per-user), Zod validation on all API inputs, memory sanitization, HSTS with preload, and Standard Webhooks verification for payment events.

---

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm (recommended) or npm

### Setup

```bash
# Clone the repo
git clone https://github.com/rudrasatani13/missiAI.git
cd missiAI

# Copy env and fill in your keys
cp .env.example .env.local

# Install dependencies
pnpm install

# Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

---

## Environment Variables

### Required

| Variable | Description |
|--------------------------------------|------------------------------------------------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Vertex AI service account JSON |
| `ELEVENLABS_API_KEY` | ElevenLabs API key for STT and TTS |
| `ELEVENLABS_VOICE_ID` | ElevenLabs voice character ID |
| `CLERK_SECRET_KEY` | Clerk secret key (server-side auth) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (client-side auth) |
| `DODO_PAYMENTS_API_KEY` | Dodo Payments API key |
| `DODO_WEBHOOK_SECRET` | Dodo webhook signature secret |
| `DODO_PRO_PRODUCT_ID` | Dodo product ID for Pro plan |
| `DODO_BUSINESS_PRODUCT_ID` | Dodo product ID for Business plan |

### Optional

| Variable | Description |
|--------------------------------------|------------------------------------------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth credentials |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | Notion OAuth credentials |
| `NOTION_API_KEY` | Notion internal integration (alternative to OAuth) |
| `VAPID_PRIVATE_KEY` | Web push notification signing key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push public key (client-side) |
| `VERTEX_AI_PROJECT_ID` / `VERTEX_AI_LOCATION` | Vertex AI backend (alternative to AI Studio) |
| `AI_BACKEND` | `"vertex"` or `"google-ai"` (default) |
| `ADMIN_USER_ID` | Clerk user ID for admin dashboard access |
| `DAILY_BUDGET_USD` | Max daily API spend in USD (default: 5.0) |
| `DODO_PAYMENTS_MODE` | `"test_mode"` or `"live_mode"` |

---

## API Endpoints

### Chat & AI

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| POST | `/api/v1/chat-stream` | Stream AI chat response via SSE |
| POST | `/api/v1/stt` | Speech-to-text transcription |
| POST | `/api/v1/tts` | Text-to-speech audio generation |
| POST | `/api/v1/actions` | Execute AI-driven actions |
| POST | `/api/v1/proactive` | Trigger proactive suggestions |

### Memory

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| GET | `/api/v1/memory` | Retrieve user's stored memory graph |
| POST | `/api/v1/memory` | Save conversation and extract memories |
| DELETE | `/api/v1/memory/[nodeId]` | Delete a memory node |

### Plugins & Integrations

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| GET | `/api/v1/plugins` | List installed plugins |
| POST | `/api/v1/plugins/refresh` | Refresh plugin data |
| GET | `/api/auth/connect/google` | Start Google Calendar OAuth flow |
| GET | `/api/auth/connect/notion` | Start Notion OAuth flow |

### Gamification

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| GET | `/api/v1/streak` | Get current streak and avatar data |
| POST | `/api/v1/streak` | Check in to a habit streak |

### Billing

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| POST | `/api/v1/billing` | Create checkout session (Dodo) |
| GET | `/api/v1/billing` | Get subscription status |
| POST | `/api/webhooks/dodo` | Dodo payment webhook |

### Other

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| POST | `/api/v1/wind-down` | Evening routine features |
| POST | `/api/v1/setup` | Save onboarding data |
| POST | `/api/v1/referral` | Referral tracking |
| POST | `/api/push/subscribe` | Register push subscription |
| GET | `/api/v1/admin/analytics` | Admin analytics dashboard |
| GET | `/api/health` | Service health check (public) |

All `/api/v1/*` routes require Clerk authentication unless noted otherwise.

---

## Project Structure

```
missi-web/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (v1 namespace)
│   │   ├── auth/           # OAuth flows (Google, Notion)
│   │   ├── v1/             # Versioned API endpoints
│   │   └── webhooks/       # Payment webhooks
│   ├── chat/               # Main voice chat interface
│   ├── memory/             # Memory dashboard + 3D graph
│   ├── streak/             # Gamification & habits
│   ├── wind-down/          # Evening routine
│   ├── pricing/            # Subscription plans
│   ├── admin/              # Admin dashboard
│   └── setup/              # Onboarding flow
├── components/
│   ├── chat/               # Voice UI, settings, plugins
│   ├── memory/             # Memory cards, search, filters
│   └── ui/                 # Shared UI primitives (Radix-based)
├── hooks/                  # Custom React hooks (16+)
├── lib/
│   ├── memory/             # KV storage, graph extraction, vectorize
│   ├── plugins/            # Plugin registry & executors
│   ├── billing/            # Dodo client & tier checking
│   ├── gamification/       # Streaks, XP engine, achievements
│   └── server/             # Auth helpers, env loader
├── services/               # AI, voice, memory service layer
├── types/                  # TypeScript type definitions
├── middleware.ts            # Clerk auth + rate limiting
└── wrangler.toml           # Cloudflare Workers config
```

---

## Scripts

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm build:cf         # Build for Cloudflare Pages
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm typecheck        # TypeScript type checking
pnpm lint             # ESLint
```

---

## Deployment

missiAI is deployed on **Cloudflare Pages** using the `@cloudflare/next-on-pages` adapter.

```bash
# Build for Cloudflare
pnpm build:cf
```

**Required Cloudflare bindings:**

| Binding | Type | ID |
|---------|------|------|
| `MISSI_MEMORY` | KV Namespace | `ddf2e5eb21484fd1a9aecd8e4eaada74` |
| `missiai-life-graph` | Vectorize Index | Semantic memory search |

Set all environment variables in the Cloudflare Pages dashboard under **Settings > Environment variables** (encrypt sensitive values). See [SECURITY.md](SECURITY.md) for the full secrets management guide.

---

## Security

See [SECURITY.md](SECURITY.md) for the full production security runbook.

**Highlights:**
- Clerk middleware on all non-public routes
- Dual-layer rate limiting (IP burst + per-user KV-backed)
- Zod schemas on all API request bodies
- Memory sanitization before KV storage
- HSTS with preload, X-Frame-Options DENY, CSP
- Standard Webhooks verification for payment events
- Daily API budget controls with alerts
- Secret scanning in CI via TruffleHog

---

## License

MIT
