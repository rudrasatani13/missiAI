# missiAI

> Your personal voice AI companion.
> Speak naturally — real-time voice conversations with Gemini AI.

**Live at [missi.space](https://missi.space)**

---

## What it does

- **Speaks and listens** — real-time voice conversations with speech-to-text and text-to-speech, plus real-time streaming via Gemini Live
- **Adapts to you** — theme support (dark/light/system) and voice preferences
- **Simple and focused** — no memory, no plugins, no billing. Just voice.

---

## Tech Stack

| Layer | Technology |
|--------------|----------------------------------------------|
| Framework | Next.js 15 (App Router), React 19, TypeScript 5 |
| Styling | Tailwind CSS 3.4 |
| AI (Chat) | Google Gemini 2.5 Flash, Gemini Live (real-time voice) |
| Voice | Gemini STT + Gemini TTS via Vertex AI |
| Auth | Clerk |
| Storage | Cloudflare KV |
| Deployment | OpenNext Cloudflare + custom worker entry |
| Testing | Vitest, ESLint, TypeScript strict mode |

---

## Architecture

missiAI is an edge-first Next.js application deployed on Cloudflare with OpenNext Cloudflare and a custom worker entrypoint for live voice relay.

**Voice flow:** User audio is transcribed with Gemini STT via Vertex AI → transcript is sent to Gemini → response streams back via SSE → audio responses are generated with Gemini TTS via Vertex AI. For real-time conversations, Gemini Live runs through the app's same-origin `/api/v1/voice-relay` path.

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
| `MISSI_KV_ENCRYPTION_SECRET` | Required in production for encrypted KV and live relay tickets |

### Optional

| Variable | Description |
|--------------------------------------|------------------------------------------------|
| `VERTEX_AI_LOCATION` | Vertex AI region (defaults to `us-central1`) |
| `AI_BACKEND` | Backend selector; currently must remain `vertex` |
| `NEXT_PUBLIC_APP_URL` | Public app origin |

Set secrets via `wrangler secret put <NAME>` or the Cloudflare dashboard → Settings → Environment variables. **Never commit values.**

---

## API Endpoints

### Chat & AI

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| POST | `/api/v1/chat-stream` | Stream AI chat response via SSE |
| POST | `/api/v1/stt` | Speech-to-text transcription |
| POST | `/api/v1/tts` | Text-to-speech audio generation |
| POST | `/api/v1/guest-chat` | Guest chat (no auth required, rate limited) |

### Other

| Method | Route | Description |
|--------|--------------------------------|-------------------------------------------|
| GET | `/api/health` | Service health check (public) |

All `/api/v1/*` routes require Clerk authentication except `/api/v1/guest-chat`.

---

## Project Structure

```
missi-web/
├── app/                    # Next.js App Router
│   ├── api/                # API routes (v1 namespace)
│   │   └── v1/             # Versioned API endpoints
│   ├── chat/               # Main voice chat interface
│   └── settings/           # Settings page (theme, voice, privacy)
├── components/
│   ├── chat/               # Voice UI
│   └── ui/                 # Shared UI primitives (Radix-based)
├── hooks/                  # Custom React hooks
├── lib/
│   ├── ai/                 # Providers, live transport, and AI services
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
| `ATOMIC_COUNTER` | Durable Object | `AtomicCounterDO` |

Set secrets via `wrangler secret put <NAME>` or the Cloudflare dashboard environment settings. See [SECURITY.md](SECURITY.md) for the full secrets management guide.

---

## Security

See [SECURITY.md](SECURITY.md) for the full production security runbook.

**Highlights:**
- Clerk middleware on all non-public routes
- Dual-layer rate limiting (IP burst + per-user KV-backed)
- Zod schemas on all API request bodies
- HSTS with preload, X-Frame-Options DENY, CSP
- Secret scanning in CI via TruffleHog

---

## License

MIT
