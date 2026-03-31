# missiAI

> Voice AI assistant with persistent memory.
> Speak naturally in Hindi, English, or Hinglish.

## What it does

- **Remembers you** — extracts and stores key facts from conversations so every interaction builds on the last
- **Speaks and listens** — real-time voice conversations with speech-to-text and text-to-speech, plus a text chat fallback
- **Adapts to you** — multiple personality modes, emotional awareness, and context-aware responses that feel human

## Tech Stack

| Layer | Technology |
|------------|----------------------------------------------|
| Frontend | Next.js 14 App Router, React, Tailwind, Three.js |
| AI | Google Gemini 2.5 Flash (chat), Gemini Flash Lite (memory) |
| Voice | ElevenLabs STT + TTS |
| Auth | Clerk |
| Storage | Cloudflare KV |
| Deployment | Cloudflare Pages |

## Architecture

missiAI is a Next.js edge application deployed on Cloudflare Pages. The frontend renders a full-screen voice interface with Three.js particle visualizations. When a user speaks, audio is sent to ElevenLabs for transcription, then the transcript is routed to Google Gemini with the user's stored memory context and selected personality. Gemini's response streams back via SSE and is simultaneously spoken aloud through ElevenLabs TTS. Every few interactions, a lightweight Gemini Flash Lite call extracts memorable facts from the conversation and persists them in Cloudflare KV, keyed to the user's Clerk ID. Clerk middleware protects all non-public routes, and an edge-based rate limiter guards API endpoints.

## Getting Started

1. **Clone the repo**
   ```bash
   git clone https://github.com/rudrasatani13/missiAI.git
   cd missiAI
   ```

2. **Copy `.env.example` and fill in your keys**
   ```bash
   cp .env.example .env.local
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Start the dev server**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) to see the app.

## Environment Variables

| Variable | Required | Description |
|--------------------------------------|----------|------------------------------------------------|
| `GEMINI_API_KEY` | Yes | Google AI Studio API key for Gemini models |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs API key for STT and TTS |
| `CLERK_SECRET_KEY` | Yes | Clerk secret key (server-side auth) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk publishable key (client-side auth) |
| `DAILY_BUDGET_USD` | No | Max daily API spend in USD (default: 5.0) |

## API Endpoints

| Method | Route | Description | Auth |
|--------|---------------|-------------------------------------------|----------|
| POST | `/api/chat` | Stream AI chat response via SSE | Required |
| GET | `/api/memory` | Retrieve user's stored memory facts | Required |
| POST | `/api/memory` | Save conversation and extract new memories | Required |
| POST | `/api/stt` | Speech-to-text transcription | Required |
| POST | `/api/tts` | Text-to-speech audio generation | Required |
| GET | `/api/health` | Health check (returns service status) | Public |

## Running Tests

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# Type checking
npm run typecheck

# Lint
npm run lint
```

## Deployment

missiAI is deployed on Cloudflare Pages using the `@cloudflare/next-on-pages` adapter.

```bash
# Build for Cloudflare
npm run build:cf
```

Set all environment variables in the Cloudflare Pages dashboard under **Settings > Environment variables**. The `MISSI_MEMORY` KV namespace must be bound in your `wrangler.toml` or Cloudflare dashboard.

## Security

- **Authentication**: All non-public routes protected by Clerk middleware
- **Rate limiting**: Dual-layer — IP-based burst guard in middleware + per-user KV-backed limits in route handlers
- **Input validation**: Zod schemas validate all API request bodies; payload size guards prevent abuse
- **Memory sanitization**: Extracted facts are sanitized before storage to prevent injection
- **Budget controls**: Daily API spend tracking with configurable alerts

## Roadmap

- [ ] Multi-device session sync with real-time memory updates
- [ ] Proactive reminders and time-aware suggestions
- [ ] Plugin system for third-party integrations (calendar, music, smart home)

## License

MIT
