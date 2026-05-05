# missiAI

> Your personal voice AI companion with persistent memory and deep integrations.
> Speak naturally in Hindi, English, or Hinglish — Missi remembers everything that matters.

**Live at [missi.space](https://missi.space)**

---

## What it does

- **Remembers you** — extracts and stores key facts from conversations into a knowledge graph, so every interaction builds on the last
- **Speaks and listens** — real-time voice conversations with speech-to-text and text-to-speech, plus real-time streaming via Gemini Live
- **Adapts to you** — context-aware responses with custom behavior dials and memory grounding
- **Connects your tools** — Google Calendar, Notion, and a growing plugin ecosystem
- **Saved memory** — review, search, filter, and delete memories Missi has stored for you

---

## Tech Stack

| Layer | Technology |
|--------------|----------------------------------------------|
| Framework | Next.js 15 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 3.4, Framer Motion |
| AI (Chat) | Google Gemini 2.5 Flash, Gemini Live (real-time voice) |
| AI (Memory) | Gemini Flash Lite (fact extraction) |
| Voice | Gemini STT + Gemini TTS via Vertex AI |
| Auth | Clerk |
| Payments | Dodo Payments (Plus & Pro tiers) |
| Storage | Cloudflare KV (memory), Cloudflare Vectorize (embeddings) |
| Deployment | OpenNext Cloudflare + custom worker entry |
| Testing | Vitest, ESLint, TypeScript strict mode |

---

## Architecture

missiAI is an edge-first Next.js application deployed on Cloudflare with OpenNext Cloudflare and a custom worker entrypoint for live voice relay.

**Voice flow:** User audio is transcribed with Gemini STT via Vertex AI → transcript is sent to Gemini with memory context + personality → response streams back via SSE → audio responses are generated with Gemini TTS via Vertex AI. For real-time conversations, Gemini Live runs through the app's same-origin `/api/v1/voice-relay` path.

**Memory system:** Every few interactions, Gemini Flash Lite extracts key facts from the conversation and persists them as saved memory records in Cloudflare KV (keyed by Clerk user ID). Cloudflare Vectorize provides semantic search over stored memories.

**Plugin system:** OAuth-based integrations (Google Calendar, Notion) fetch context that gets injected into the AI prompt. An action engine lets the AI draft emails, create calendar events, and execute tasks on the user's behalf.

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
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Vertex AI service account JSON for chat, STT/TTS, and live relay auth |
| `VERTEX_AI_PROJECT_ID` | Google Cloud project ID used to build Vertex model paths |
| `CLERK_SECRET_KEY` | Clerk secret key (server-side auth) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (client-side auth) |
| `DODO_PAYMENTS_API_KEY` | Dodo Payments API key |
| `DODO_WEBHOOK_SECRET` | Dodo webhook signature secret |
| `DODO_PLUS_PRODUCT_ID` | Dodo product ID for Plus plan checkout |
| `DODO_PRO_PRODUCT_ID` | Dodo product ID for Pro plan |
| `MISSI_KV_ENCRYPTION_SECRET` | Required in production for encrypted KV, confirmation tokens, boss tokens, and live relay tickets |

### Optional

| Variable | Description |
|--------------------------------------|------------------------------------------------|
| `VERTEX_AI_LOCATION` | Vertex AI region (defaults to `us-central1`) |
| `AI_BACKEND` | Backend selector; currently must remain `vertex` |
| `OPENAI_API_KEY` / `ENABLE_OPENAI_FALLBACK` | Optional OpenAI fallback provider configuration |
| `ANTHROPIC_API_KEY` | Optional Anthropic/Claude fallback provider configuration |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Calendar OAuth credentials |
| `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` | Notion OAuth credentials |
| `NOTION_API_KEY` | Notion internal integration (alternative to OAuth) |
| `VAPID_PRIVATE_KEY` | Web push notification signing key |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web push public key (client-side) |
| `NEXT_PUBLIC_APP_URL` | Public app origin used in billing return URLs and OAuth redirects |
| `ADMIN_USER_ID` | Clerk user ID for admin dashboard access |
| `DAILY_BUDGET_USD` | Max daily AI provider spend in USD (default: 5.0) |
| `DODO_PAYMENTS_MODE` | `"test_mode"` or `"live_mode"` |

### WhatsApp & Telegram Bot (Feature 10)

Set via `wrangler secret put <NAME>` or the Cloudflare dashboard → Settings → Environment variables. **Never commit values.**

| Variable | Description |
|--------------------------------------|------------------------------------------------|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta Cloud API phone number ID |
| `WHATSAPP_ACCESS_TOKEN` | Meta permanent access token |
| `WHATSAPP_APP_SECRET` | HMAC-SHA256 signature key for incoming webhooks |
| `WHATSAPP_VERIFY_TOKEN` | Token for Meta webhook GET verification challenge |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token (format: `123456:ABC-…`) |
| `TELEGRAM_WEBHOOK_SECRET` | Secret token set when registering the Telegram webhook |
| `TELEGRAM_BOT_USERNAME` | Telegram bot username (without @), used for deep-link URLs |

---

## KV Key Schema (MISSI_MEMORY namespace)

### Current core keys

| Key pattern | Value | TTL |
|---|---|---|
| `lifegraph:v2:meta:{userId}` | JSON `LifeGraphMeta` | none |
| `lifegraph:v2:index:{userId}` | JSON `LifeGraphIndex` | none |
| `lifegraph:v2:node:{userId}:{nodeId}` | JSON `LifeNode` | none |
| `dodo:sub:{subscriptionId}` | userId string | none |
| `webhook:event:{type}:{webhookId}` | `"1"` | 86400 s (24 h) |
| `usage:{userId}:{date}` | JSON `DailyUsage` | ~48 h |

### Bot integrations (Feature 10)

| Key pattern | Value | TTL |
|---|---|---|
| `bot:wa:{e164Phone}` | Clerk userId | none |
| `bot:wa:user:{clerkUserId}` | e164Phone | none |
| `bot:tg:{telegramUserId}` | Clerk userId | none |
| `bot:tg:user:{clerkUserId}` | telegramUserId | none |
| `bot:otp:{clerkUserId}` | JSON `{ otp, expiresAt }` | 600 s (10 min) |
| `bot:otp:attempts:{userId}:{date}` | attempt count | 86400 s (24 h) |
| `bot:tglink:{code}` | JSON `{ clerkUserId, expiresAt }` | 900 s (15 min) |
| `bot:dedup:wa:{messageId}` | `"1"` | 604800 s (7 days) |
| `bot:dedup:tg:{updateId}` | `"1"` | 604800 s (7 days) |
| `bot:daily:wa:{clerkUserId}:{date}` | message count | 172800 s (48 h) |
| `bot:daily:tg:{clerkUserId}:{date}` | message count | 172800 s (48 h) |

---

## API Endpoints

### Chat & AI

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| POST | `/api/v1/chat-stream` | Stream AI chat response via SSE |
| POST | `/api/v1/stt` | Speech-to-text transcription |
| POST | `/api/v1/tts` | Text-to-speech audio generation |

### Memory

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| GET | `/api/v1/memory` | Retrieve user's saved memories |
| POST | `/api/v1/memory` | Save conversation and extract memories |
| DELETE | `/api/v1/memory/[nodeId]` | Delete a memory node |

### Plugins & Integrations

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| GET | `/api/v1/plugins` | List installed plugins |
| POST | `/api/v1/plugins/refresh` | Refresh plugin data |
| GET | `/api/auth/connect/google` | Start Google Calendar OAuth flow |
| GET | `/api/auth/connect/notion` | Start Notion OAuth flow |

### Billing

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| POST | `/api/v1/billing` | Create checkout session (Dodo) |
| GET | `/api/v1/billing` | Get subscription status |
| POST | `/api/webhooks/dodo` | Dodo payment webhook |
| GET/POST | `/api/webhooks/whatsapp` | WhatsApp Cloud API webhook (Meta) |
| POST | `/api/webhooks/telegram` | Telegram Bot API webhook |

### Bot Integrations (Pro plan required)

| Method | Route | Description |
|--------|------------------------------------------------|-------------------------------------------|
| GET | `/api/v1/bot/link/whatsapp` | Get WhatsApp link status |
| POST | `/api/v1/bot/link/whatsapp` | Initiate or verify WhatsApp OTP linking |
| GET | `/api/v1/bot/link/telegram` | Get Telegram link status |
| POST | `/api/v1/bot/link/telegram` | Generate Telegram deep-link code |
| POST | `/api/v1/bot/unlink` | Unlink WhatsApp or Telegram account |

### Other

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| POST | `/api/v1/setup` | Save onboarding data |
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
│   ├── memory/             # Saved memory dashboard
│   ├── pricing/            # Subscription plans
│   ├── admin/              # Admin dashboard
│   └── setup/              # Onboarding flow
├── components/
│   ├── chat/               # Voice UI, settings, plugins
│   ├── memory/             # Memory cards, search, filters
│   └── ui/                 # Shared UI primitives (Radix-based)
├── hooks/                  # Custom React hooks (16+)
├── lib/
│   ├── ai/                 # Providers, live transport, and AI services
│   ├── memory/             # KV storage, graph extraction, vectorize
│   ├── plugins/            # Plugin registry & executors
│   ├── billing/            # Dodo client & tier checking
│   └── server/             # Platform, security, observability, chat, route helpers
├── types/                  # TypeScript type definitions
├── middleware.ts            # Clerk auth + rate limiting
└── wrangler.toml           # Cloudflare Workers config
```

---

## Scripts

```bash
pnpm dev              # Start dev server
pnpm build            # Production build
pnpm build:cf         # Build OpenNext output for Cloudflare
pnpm deploy:cf        # Deploy the Cloudflare worker bundle
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report
pnpm typecheck        # TypeScript type checking
pnpm lint             # ESLint
```

---

## Deployment

missiAI is deployed on Cloudflare using **OpenNext Cloudflare**. `workers/entry.ts` wraps the OpenNext worker so `/api/v1/voice-relay` can upgrade WebSockets on the raw runtime.

```bash
# Build and deploy for Cloudflare
pnpm build:cf
pnpm deploy:cf
```

**Required Cloudflare bindings:**

| Binding | Type | ID |
|---------|------|------|
| `MISSI_MEMORY` | KV Namespace | `ddf2e5eb21484fd1a9aecd8e4eaada74` |
| `LIFE_GRAPH` | Vectorize Index | `missiai-life-graph` |
| `ATOMIC_COUNTER` | Durable Object | `AtomicCounterDO` |

Set secrets via `wrangler secret put <NAME>` or the Cloudflare dashboard environment settings. See [SECURITY.md](SECURITY.md) for the full secrets management guide.

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
- Daily AI spend controls with alerts
- Secret scanning in CI via TruffleHog

---

## License

MIT
