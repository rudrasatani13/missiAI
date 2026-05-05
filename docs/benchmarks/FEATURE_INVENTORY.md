# Feature Inventory

This inventory reflects the current repo surface after the deleted-feature cleanup. The canonical structured source is `benchmarks/feature-manifest.ts`.

## 1. Public Marketing and Legal

- Feature name: Public Marketing and Legal
- Main app routes/pages: `/` (redirects to /chat), `/manifesto`, `/privacy`, `/terms`
- API endpoints: none
- Key server files: `app/layout.tsx`, `next.config.mjs`, static assets under `public/`
- Key client components/hooks: `app/page.tsx`
- External dependencies/services involved: Next.js App Router, static assets
- Required benchmark types: HTTP route latency, build time, bundle size, render/import cost

## 2. Auth, Setup, and Middleware Security

- Feature name: Auth, Setup, and Middleware Security
- Main app routes/pages: `/sign-in`, `/sign-up`, `/setup`
- API endpoints: `/api/health`
- Key server files: `middleware.ts`, `lib/server/security/auth.ts`, `lib/server/security/admin-auth.ts`, `lib/server/security/rate-limiter.ts`, `lib/setup/setup-completion.ts`
- Key client components/hooks: `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`, `app/setup/page.tsx`, `components/auth/SessionGuard.tsx`
- External dependencies/services involved: Clerk, Cloudflare KV, Next.js middleware
- Required benchmark types: HTTP route latency, server-function benchmark, build time, bundle size

## 3. Chat Core and SSE Streaming

- Feature name: Chat Core and SSE Streaming
- Main app routes/pages: `/chat`
- API endpoints: `/api/v1/chat`, `/api/v1/chat-stream`, `/api/v1/guest-chat`
- Key server files: `app/api/v1/chat/route.ts`, `app/api/v1/chat-stream/route.ts`, `app/api/v1/guest-chat/route.ts`, `lib/server/chat/route-context.ts`, `lib/server/chat/stream-context.ts`, `lib/server/chat/route-runner.ts`, `lib/server/chat/stream-runner.ts`
- Key client components/hooks: `app/chat/page.tsx`, `hooks/chat/useChatEntryFlow.ts`, `hooks/chat/useChatHydration.ts`, `hooks/chat/useChatPageEffects.ts`, `components/chat/ChatPageShell.tsx`, `components/chat/GuestChatPage.tsx`
- External dependencies/services involved: Clerk, Cloudflare KV, Cloudflare Vectorize, Vertex AI / Gemini
- Required benchmark types: HTTP route latency, API latency, server-function benchmark, bundle size, render/import cost, memory usage, mocked integration benchmark

## 4. Voice, STT, TTS, and Live Relay

- Feature name: Voice, STT, TTS, and Live Relay
- Main app routes/pages: `/chat`
- API endpoints: `/api/v1/live-token`, `/api/v1/stt`, `/api/v1/tts`
- Key server files: `app/api/v1/live-token/route.ts`, `app/api/v1/stt/route.ts`, `app/api/v1/tts/route.ts`, `lib/ai/live/transport.ts`, `lib/ai/live/runtime.ts`, `lib/ai/services/voice-service.ts`, `workers/entry.ts`, `workers/live/handler.ts`, `workers/live/upstream.ts`
- Key client components/hooks: `hooks/chat/useGeminiLive.ts`, `hooks/chat/useVoiceStateMachine.ts`, `components/chat/VoiceButton.tsx`, `components/chat/ParticleVisualizer.tsx`
- External dependencies/services involved: Clerk, Vertex AI / Gemini Live, Cloudflare Workers relay, Cloudflare KV
- Required benchmark types: API latency, server-function benchmark, bundle size, render/import cost, memory usage, mocked integration benchmark

## 5. Saved Memory

- Feature name: Saved Memory
- Main app routes/pages: `/memory`
- API endpoints: `/api/v1/memory`, `/api/v1/memory/[nodeId]`
- Key server files: `app/api/v1/memory/route.ts`, `app/api/v1/memory/[nodeId]/route.ts`, `lib/server/routes/memory/runner.ts`, `lib/server/routes/memory/node-runner.ts`, `lib/memory/life-graph.ts`, `lib/memory/graph-extractor.ts`
- Key client components/hooks: `app/memory/page.tsx`, `hooks/memory/useMemoryDashboard.ts`, `components/memory/GroupedMemoryView.tsx`, `components/memory/StatsBar.tsx`, `components/memory/MemorySearch.tsx`, `components/memory/CategoryFilter.tsx`
- External dependencies/services involved: Clerk, Cloudflare KV, Cloudflare Vectorize, Vertex AI / Gemini
- Required benchmark types: HTTP route latency, API latency, server-function benchmark, bundle size, render/import cost, memory usage, mocked integration benchmark

## 6. Billing and Pricing

- Feature name: Billing and Pricing
- Main app routes/pages: `/pricing`
- API endpoints: `/api/v1/billing`, `/api/webhooks/dodo`
- Key server files: `app/api/v1/billing/route.ts`, `app/api/webhooks/dodo/route.ts`, `lib/server/routes/billing/runner.ts`, `lib/billing/dodo-client.ts`, `lib/billing/tier-checker.ts`
- Key client components/hooks: `app/pricing/page.tsx`, `hooks/billing/useBilling.ts`, `components/feedback/CelebrationOverlay.tsx`
- External dependencies/services involved: Clerk, Dodo Payments, Cloudflare KV
- Required benchmark types: HTTP route latency, API latency, server-function benchmark, bundle size, render/import cost, memory usage, mocked integration benchmark

## 8. Plugins and Productivity Integrations

- Feature name: Plugins and Productivity Integrations
- Main app routes/pages: `/settings/integrations`
- API endpoints: `/api/v1/plugins/[[...path]]`, `/api/auth/connect/google`, `/api/auth/callback/google`, `/api/auth/connect/notion`, `/api/auth/callback/notion`
- Key server files: `app/api/v1/plugins/[[...path]]/route.ts`, `lib/server/routes/plugins/runner.ts`, `lib/plugins/plugin-executor.ts`, `lib/plugins/plugin-store.ts`, `lib/plugins/notion-plugin.ts`, `lib/plugins/calendar-plugin.ts`
- Key client components/hooks: `app/settings/integrations/page.tsx`, `hooks/chat/usePlugins.ts`
- External dependencies/services involved: Clerk, Google OAuth / Calendar, Notion API, Cloudflare KV
- Required benchmark types: HTTP route latency, API latency, server-function benchmark, bundle size, render/import cost, memory usage, mocked integration benchmark

## 9. Messaging Bots and Public Webhooks

- Feature name: Messaging Bots and Public Webhooks
- Main app routes/pages: `/settings/integrations`
- API endpoints: `/api/v1/bot/link/whatsapp`, `/api/v1/bot/link/telegram`, `/api/v1/bot/unlink`, `/api/webhooks/whatsapp`, `/api/webhooks/telegram`
- Key server files: `app/api/v1/bot/link/whatsapp/route.ts`, `app/api/v1/bot/link/telegram/route.ts`, `app/api/webhooks/whatsapp/route.ts`, `app/api/webhooks/telegram/route.ts`, `lib/bot/bot-pipeline.ts`, `lib/bot/whatsapp-client.ts`, `lib/bot/telegram-client.ts`, `lib/bot/bot-auth.ts`
- Key client components/hooks: `app/settings/integrations/page.tsx`
- External dependencies/services involved: WhatsApp, Telegram, Cloudflare KV, Cloudflare Vectorize, Gemini
- Required benchmark types: API latency, server-function benchmark, bundle size, memory usage, mocked integration benchmark

## 10. Settings, Notifications, and Push

- Feature name: Settings, Notifications, and Push
- Main app routes/pages: `/settings`
- API endpoints: `/api/v1/notification-prefs`, `/api/push/[...path]`
- Key server files: `app/api/v1/notification-prefs/route.ts`, `app/api/push/[...path]/route.ts`, `lib/server/routes/notification-prefs/runner.ts`, `lib/notifications/prefs.ts`, `lib/push/push-sender.ts`
- Key client components/hooks: `app/settings/page.tsx`, `hooks/chat/useChatSettings.ts`
- External dependencies/services involved: Clerk, Cloudflare KV, Web Push
- Required benchmark types: HTTP route latency, API latency, server-function benchmark, bundle size, render/import cost, memory usage

## 12. Admin, Health, Analytics, and Observability

- Feature name: Admin, Health, Analytics, and Observability
- Main app routes/pages: `/admin`
- API endpoints: `/api/health`, `/api/v1/health`, `/api/v1/admin/analytics`, `/api/v1/admin/life-graph/backfill`, `/api/v1/admin/users/[id]/plan`, `/api/v1/admin/users/[id]/role`, `/api/v1/client-errors`
- Key server files: `app/admin/page.tsx`, `app/api/v1/health/route.ts`, `app/api/v1/admin/analytics/route.ts`, `lib/analytics/aggregator.ts`, `lib/server/observability/logger.ts`, `lib/server/observability/cost-tracker.ts`, `lib/server/platform/bindings.ts`
- Key client components/hooks: `app/admin/page.tsx`, `hooks/admin/useAnalytics.ts`
- External dependencies/services involved: Clerk, Cloudflare KV, Cloudflare D1, Cloudflare Vectorize, Durable Objects, provider health probes
- Required benchmark types: HTTP route latency, API latency, server-function benchmark, bundle size, render/import cost, memory usage, mocked integration benchmark
