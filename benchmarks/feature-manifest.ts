import type { BenchmarkType } from "./benchmark-utils"

export type BenchmarkPriority = "P0" | "P1" | "P2" | "P3"

export type BenchmarkAuthMode = "public" | "required"

export interface HttpBenchmarkSpec {
  id: string
  target: string
  authMode?: BenchmarkAuthMode
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  expectedStatus?: number | number[]
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: string
  notes?: string
  requiresEnv?: string[]
  requiresMocking?: boolean
}

export interface ServerFunctionBenchmarkSpec {
  id: string
  modulePath: string
  exportName: string
  benchmarkType?: Extract<
    BenchmarkType,
    "server-function-benchmark" | "memory-usage" | "mocked-integration-benchmark"
  >
  staticArgs?: unknown[]
  fixtureModule?: string
  fixtureExport?: string
  iterations?: number
  warmupIterations?: number
  notes?: string
  requiresEnv?: string[]
  requiresMocking?: boolean
}

export interface BundleBenchmarkSpec {
  id: string
  routes?: string[]
  apiRoutes?: string[]
  importTargets?: string[]
  notes?: string
}

export interface FeatureManifestEntry {
  id: string
  name: string
  category: string
  routes: string[]
  apiEndpoints: string[]
  serverFiles: string[]
  clientFiles: string[]
  benchmarkTypes: BenchmarkType[]
  authRequired: boolean
  externalServices: string[]
  benchmarkPriority: BenchmarkPriority
  notes: string
  httpBenchmarks?: HttpBenchmarkSpec[]
  apiBenchmarks?: HttpBenchmarkSpec[]
  serverBenchmarks?: ServerFunctionBenchmarkSpec[]
  bundleBenchmarks?: BundleBenchmarkSpec[]
}

const featureManifest = [
  {
    id: "public-marketing",
    name: "Public Marketing and Legal",
    category: "marketing",
    routes: ["/", "/manifesto", "/privacy", "/terms"],
    apiEndpoints: [],
    serverFiles: ["app/layout.tsx", "next.config.mjs", "public/videos/home-hero.mp4"],
    clientFiles: [
      "app/page.tsx",
    ],
    benchmarkTypes: ["http-route-latency", "build-time", "bundle-size", "render-import-cost"],
    authRequired: false,
    externalServices: ["Static assets", "Next.js App Router"],
    benchmarkPriority: "P3",
    notes: "Public entry surfaces should stay fast on cold loads and mobile networks.",
    httpBenchmarks: [
      { id: "home-redirect", target: "/", authMode: "public", expectedStatus: 307 },
      { id: "manifesto-page", target: "/manifesto", authMode: "public", expectedStatus: 200 },
      { id: "privacy-page", target: "/privacy", authMode: "public", expectedStatus: 200 },
      { id: "terms-page", target: "/terms", authMode: "public", expectedStatus: 200 },
    ],
    bundleBenchmarks: [
      {
        id: "public-marketing-bundle",
        routes: ["/", "/manifesto", "/privacy", "/terms"],
        importTargets: ["app/page.tsx"],
      },
    ],
  },
  {
    id: "auth-onboarding",
    name: "Auth, Setup, and Middleware Security",
    category: "auth",
    routes: ["/sign-in", "/sign-up", "/setup"],
    apiEndpoints: ["/api/health"],
    serverFiles: [
      "middleware.ts",
      "lib/server/security/auth.ts",
      "lib/server/security/admin-auth.ts",
      "lib/server/security/rate-limiter.ts",
      "lib/setup/setup-completion.ts",
    ],
    clientFiles: [
      "app/(auth)/sign-in/page.tsx",
      "app/(auth)/sign-up/page.tsx",
      "app/setup/page.tsx",
      "components/auth/SessionGuard.tsx",
    ],
    benchmarkTypes: ["http-route-latency", "server-function-benchmark", "build-time", "bundle-size"],
    authRequired: false,
    externalServices: ["Clerk", "Cloudflare KV", "Next.js Middleware"],
    benchmarkPriority: "P0",
    notes: "This feature gates every authenticated flow; benchmark skips are preferred to false unauthorised failures.",
    httpBenchmarks: [
      { id: "sign-in-page", target: "/sign-in", authMode: "public", expectedStatus: 200 },
      { id: "sign-up-page", target: "/sign-up", authMode: "public", expectedStatus: 200 },
      { id: "setup-page", target: "/setup", authMode: "required", expectedStatus: [200, 307] },
    ],
    serverBenchmarks: [
      {
        id: "setup-completion-import",
        modulePath: "lib/setup/setup-completion.ts",
        exportName: "hasCompletedSetupLocally",
        staticArgs: [],
        notes: "Local setup completion helper benchmarked in the Node runtime; it should return false when window is unavailable.",
      },
    ],
    bundleBenchmarks: [
      {
        id: "auth-bundle",
        routes: ["/sign-in", "/sign-up", "/setup"],
        importTargets: ["app/(auth)/sign-in/page.tsx", "app/setup/page.tsx"],
      },
    ],
  },
  {
    id: "chat-core",
    name: "Chat Core and SSE Streaming",
    category: "conversation",
    routes: ["/chat"],
    apiEndpoints: ["/api/v1/chat", "/api/v1/chat-stream"],
    serverFiles: [
      "app/api/v1/chat/route.ts",
      "app/api/v1/chat-stream/route.ts",
      "lib/server/chat/route-context.ts",
      "lib/server/chat/stream-context.ts",
      "lib/server/chat/stream-runner.ts",
      "lib/server/chat/route-runner.ts",
    ],
    clientFiles: [
      "app/chat/page.tsx",
      "hooks/chat/useChatEntryFlow.ts",
      "hooks/chat/useChatHydration.ts",
      "hooks/chat/useChatPageEffects.ts",
      "components/chat/ChatPageShell.tsx",
    ],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Cloudflare KV", "Cloudflare Vectorize", "Vertex AI / Gemini"],
    benchmarkPriority: "P0",
    notes: "The chat page mixes hydration, SSE streaming, memory lookup, actions, and plugin context.",
    httpBenchmarks: [{ id: "chat-page", target: "/chat", authMode: "required", expectedStatus: 200 }],
    apiBenchmarks: [
      {
        id: "chat-route",
        target: "/api/v1/chat",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 401, 429],
        requiresMocking: true,
        notes: "Use mock provider fixtures for LLM latency baselines.",
      },
      {
        id: "chat-stream-route",
        target: "/api/v1/chat-stream",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 401, 429],
        requiresMocking: true,
      },
    ],
    serverBenchmarks: [
      {
        id: "chat-route-preflight",
        modulePath: "lib/server/chat/route-preflight.ts",
        exportName: "runChatRoutePreflight",
        fixtureModule: "benchmarks/fixtures/chat/route-preflight.fixture.ts",
        requiresMocking: true,
        benchmarkType: "mocked-integration-benchmark",
        notes: "Exercise auth, rate-limit, and payload validation without calling providers.",
      },
      {
        id: "chat-stream-preflight",
        modulePath: "lib/server/chat/stream-preflight.ts",
        exportName: "runChatStreamPreflight",
        fixtureModule: "benchmarks/fixtures/chat/stream-preflight.fixture.ts",
        requiresMocking: true,
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "chat-bundle",
        routes: ["/chat"],
        apiRoutes: ["/api/v1/chat", "/api/v1/chat-stream"],
        importTargets: ["app/chat/page.tsx", "components/chat/ChatPageShell.tsx"],
      },
    ],
  },
  {
    id: "voice-live",
    name: "Voice, STT, TTS, and Live Relay",
    category: "voice",
    routes: ["/chat"],
    apiEndpoints: ["/api/v1/live-token", "/api/v1/stt", "/api/v1/tts"],
    serverFiles: [
      "app/api/v1/live-token/route.ts",
      "app/api/v1/stt/route.ts",
      "app/api/v1/tts/route.ts",
      "lib/ai/live/transport.ts",
      "lib/ai/live/runtime.ts",
      "lib/ai/services/voice-service.ts",
      "workers/entry.ts",
      "workers/live/handler.ts",
      "workers/live/upstream.ts",
    ],
    clientFiles: [
      "hooks/chat/useGeminiLive.ts",
      "hooks/chat/useVoiceStateMachine.ts",
      "components/chat/VoiceButton.tsx",
      "components/chat/ParticleVisualizer.tsx",
    ],
    benchmarkTypes: [
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Vertex AI / Gemini Live", "Cloudflare Workers", "Cloudflare KV"],
    benchmarkPriority: "P0",
    notes: "Live-token and media APIs must skip safely when auth, provider, or worker relay fixtures are absent.",
    apiBenchmarks: [
      {
        id: "live-token-route",
        target: "/api/v1/live-token",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 401, 429, 503],
        requiresMocking: true,
      },
      {
        id: "stt-route",
        target: "/api/v1/stt",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 400, 401, 429, 503],
        requiresMocking: true,
      },
      {
        id: "tts-route",
        target: "/api/v1/tts",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 400, 401, 429, 503],
        requiresMocking: true,
      },
    ],
    serverBenchmarks: [
      {
        id: "live-transport-session",
        modulePath: "lib/ai/live/transport.ts",
        exportName: "getLiveTransportSession",
        fixtureModule: "benchmarks/fixtures/voice/live-transport.fixture.ts",
        requiresMocking: true,
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "voice-import-cost",
        routes: ["/chat"],
        apiRoutes: ["/api/v1/live-token", "/api/v1/stt", "/api/v1/tts"],
        importTargets: ["hooks/chat/useGeminiLive.ts", "hooks/chat/useVoiceStateMachine.ts"],
      },
    ],
  },
  {
    id: "memory-core",
    name: "Saved Memory",
    category: "memory",
    routes: ["/memory"],
    apiEndpoints: ["/api/v1/memory", "/api/v1/memory/[nodeId]"],
    serverFiles: [
      "app/api/v1/memory/route.ts",
      "app/api/v1/memory/[nodeId]/route.ts",
      "lib/server/routes/memory/runner.ts",
      "lib/server/routes/memory/node-runner.ts",
      "lib/memory/life-graph.ts",
      "lib/memory/graph-extractor.ts",
    ],
    clientFiles: [
      "app/memory/page.tsx",
      "hooks/memory/useMemoryDashboard.ts",
      "components/memory/GroupedMemoryView.tsx",
    ],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Cloudflare KV", "Cloudflare Vectorize", "Vertex AI / Gemini"],
    benchmarkPriority: "P0",
    notes: "Memory formatting can run locally, but extraction and vector search should default to mock fixtures.",
    httpBenchmarks: [
      { id: "memory-page", target: "/memory", authMode: "required", expectedStatus: 200 },
    ],
    apiBenchmarks: [
      {
        id: "memory-route",
        target: "/api/v1/memory",
        method: "GET",
        authMode: "required",
        expectedStatus: [200, 401, 503],
      },
    ],
    serverBenchmarks: [
      {
        id: "format-life-graph",
        modulePath: "lib/memory/life-graph.ts",
        exportName: "formatLifeGraphForPrompt",
        staticArgs: [
          [
            {
              node: {
                id: "node_1",
                userId: "user_fixture",
                title: "Finish benchmark framework",
                detail: "Create feature manifest and result writer",
                category: "goal",
                tags: ["engineering", "planning"],
                people: [],
                emotionalWeight: 0.6,
                confidence: 0.9,
                createdAt: 1,
                updatedAt: 1,
                accessCount: 3,
                lastAccessedAt: 1,
                source: "conversation",
              },
              score: 0.9,
              reason: "fixture relevance match",
            },
            {
              node: {
                id: "node_2",
                userId: "user_fixture",
                title: "Track skipped benchmarks",
                detail: "Document why auth and fixtures were unavailable",
                category: "skill",
                tags: ["benchmarking", "docs"],
                people: [],
                emotionalWeight: 0.3,
                confidence: 0.85,
                createdAt: 1,
                updatedAt: 1,
                accessCount: 1,
                lastAccessedAt: 1,
                source: "conversation",
              },
              score: 0.7,
              reason: "fixture relevance match",
            },
          ],
        ],
        benchmarkType: "server-function-benchmark",
      },
      {
        id: "extract-life-nodes",
        modulePath: "lib/memory/graph-extractor.ts",
        exportName: "extractLifeNodes",
        fixtureModule: "benchmarks/fixtures/memory/graph-extractor.fixture.ts",
        requiresMocking: true,
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "memory-bundle",
        routes: ["/memory"],
        apiRoutes: ["/api/v1/memory"],
        importTargets: ["app/memory/page.tsx", "components/memory/GroupedMemoryView.tsx"],
      },
    ],
  },
  {
    id: "billing",
    name: "Billing and Pricing",
    category: "revenue",
    routes: ["/pricing"],
    apiEndpoints: ["/api/v1/billing", "/api/webhooks/dodo"],
    serverFiles: [
      "app/api/v1/billing/route.ts",
      "app/api/webhooks/dodo/route.ts",
      "lib/server/routes/billing/runner.ts",
      "lib/billing/dodo-client.ts",
      "lib/billing/tier-checker.ts",
    ],
    clientFiles: [
      "app/pricing/page.tsx",
      "hooks/billing/useBilling.ts",
      "components/feedback/CelebrationOverlay.tsx",
    ],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Dodo Payments", "Cloudflare KV"],
    benchmarkPriority: "P0",
    notes: "Checkout and plan refresh should never require live payment traffic in benchmark mode.",
    httpBenchmarks: [{ id: "pricing-page", target: "/pricing", authMode: "public", expectedStatus: 200 }],
    apiBenchmarks: [
      { id: "billing-route", target: "/api/v1/billing", authMode: "required", expectedStatus: [200, 401, 503] },
      {
        id: "dodo-webhook",
        target: "/api/webhooks/dodo",
        method: "POST",
        authMode: "public",
        expectedStatus: [200, 400, 401, 500],
        requiresMocking: true,
      },
    ],
    serverBenchmarks: [],
    bundleBenchmarks: [
      {
        id: "billing-bundle",
        routes: ["/pricing"],
        apiRoutes: ["/api/v1/billing", "/api/webhooks/dodo"],
        importTargets: ["app/pricing/page.tsx", "hooks/billing/useBilling.ts"],
      },
    ],
  },
  {
    id: "daily-brief-proactive",
    name: "Daily Brief and Proactive Nudges",
    category: "assistant",
    routes: ["/today"],
    apiEndpoints: ["/api/v1/daily-brief/[[...path]]", "/api/v1/proactive"],
    serverFiles: [
      "app/api/v1/daily-brief/[[...path]]/route.ts",
      "app/api/v1/proactive/route.ts",
      "lib/server/routes/daily-brief/runner.ts",
      "lib/server/routes/proactive/runner.ts",
      "lib/proactive/briefing-generator.ts",
      "lib/proactive/nudge-engine.ts",
    ],
    clientFiles: [
      "app/today/page.tsx",
      "components/daily-brief/TodayMissionClient.tsx",
      "hooks/chat/useProactive.ts",
    ],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Cloudflare KV", "Gemini"],
    benchmarkPriority: "P1",
    notes: "Daily brief generation is AI-backed; use saved prompt fixtures for predictable baselines.",
    httpBenchmarks: [{ id: "today-page", target: "/today", authMode: "required", expectedStatus: 200 }],
    apiBenchmarks: [
      {
        id: "daily-brief-route",
        target: "/api/v1/daily-brief",
        authMode: "required",
        expectedStatus: [200, 401, 404],
      },
      { id: "proactive-route", target: "/api/v1/proactive", authMode: "required", expectedStatus: [200, 401] },
    ],
    serverBenchmarks: [
      {
        id: "daily-brief-generator",
        modulePath: "lib/proactive/briefing-generator.ts",
        exportName: "generateDailyBriefing",
        fixtureModule: "benchmarks/fixtures/proactive/daily-brief.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "daily-brief-bundle",
        routes: ["/today"],
        apiRoutes: ["/api/v1/daily-brief/[[...path]]", "/api/v1/proactive"],
        importTargets: ["components/daily-brief/TodayMissionClient.tsx"],
      },
    ],
  },
  {
    id: "plugins-integrations",
    name: "Plugins and Productivity Integrations",
    category: "integrations",
    routes: ["/settings/integrations"],
    apiEndpoints: [
      "/api/v1/plugins/[[...path]]",
      "/api/auth/connect/google",
      "/api/auth/callback/google",
      "/api/auth/connect/notion",
      "/api/auth/callback/notion",
    ],
    serverFiles: [
      "app/api/v1/plugins/[[...path]]/route.ts",
      "lib/server/routes/plugins/runner.ts",
      "lib/plugins/plugin-executor.ts",
      "lib/plugins/plugin-store.ts",
      "lib/plugins/notion-plugin.ts",
      "lib/plugins/calendar-plugin.ts",
    ],
    clientFiles: [
      "app/settings/integrations/page.tsx",
      "hooks/chat/usePlugins.ts",
    ],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Google OAuth / Calendar", "Notion API", "Cloudflare KV"],
    benchmarkPriority: "P1",
    notes: "Connection refresh and execution should be benchmarked with stored credentials fixtures, not live provider tokens.",
    httpBenchmarks: [
      { id: "integrations-page", target: "/settings/integrations", authMode: "required", expectedStatus: 200 },
    ],
    apiBenchmarks: [
      { id: "plugins-route", target: "/api/v1/plugins", authMode: "required", expectedStatus: [200, 401] },
    ],
    serverBenchmarks: [
      {
        id: "plugin-command-builder",
        modulePath: "lib/plugins/plugin-executor.ts",
        exportName: "buildPluginCommand",
        fixtureModule: "benchmarks/fixtures/plugins/plugin-command.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "plugins-bundle",
        routes: ["/settings/integrations"],
        apiRoutes: ["/api/v1/plugins/[[...path]]"],
        importTargets: ["app/settings/integrations/page.tsx", "hooks/chat/usePlugins.ts"],
      },
    ],
  },
  {
    id: "messaging-bots",
    name: "Messaging Bots and Public Webhooks",
    category: "integrations",
    routes: ["/settings/integrations"],
    apiEndpoints: [
      "/api/v1/bot/link/whatsapp",
      "/api/v1/bot/link/telegram",
      "/api/v1/bot/unlink",
      "/api/webhooks/whatsapp",
      "/api/webhooks/telegram",
    ],
    serverFiles: [
      "app/api/v1/bot/link/whatsapp/route.ts",
      "app/api/v1/bot/link/telegram/route.ts",
      "app/api/webhooks/whatsapp/route.ts",
      "app/api/webhooks/telegram/route.ts",
      "lib/bot/bot-pipeline.ts",
      "lib/bot/whatsapp-client.ts",
      "lib/bot/telegram-client.ts",
      "lib/bot/bot-auth.ts",
    ],
    clientFiles: ["app/settings/integrations/page.tsx"],
    benchmarkTypes: [
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: false,
    externalServices: ["WhatsApp", "Telegram", "Cloudflare KV", "Cloudflare Vectorize", "Gemini"],
    benchmarkPriority: "P1",
    notes: "Webhook traffic is public and should only run under fixture payloads; linking routes are auth-gated.",
    apiBenchmarks: [
      {
        id: "whatsapp-link-route",
        target: "/api/v1/bot/link/whatsapp",
        authMode: "required",
        expectedStatus: [200, 401],
      },
      {
        id: "telegram-webhook-route",
        target: "/api/webhooks/telegram",
        method: "POST",
        authMode: "public",
        expectedStatus: [200, 400, 401, 500],
        requiresMocking: true,
      },
      {
        id: "whatsapp-webhook-route",
        target: "/api/webhooks/whatsapp",
        method: "POST",
        authMode: "public",
        expectedStatus: [200, 400, 401, 500],
        requiresMocking: true,
      },
    ],
    serverBenchmarks: [
      {
        id: "bot-pipeline",
        modulePath: "lib/bot/bot-pipeline.ts",
        exportName: "processBotMessage",
        fixtureModule: "benchmarks/fixtures/bots/bot-pipeline.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "messaging-bots-bundle",
        routes: ["/settings/integrations"],
        apiRoutes: ["/api/v1/bot/link/whatsapp", "/api/webhooks/telegram", "/api/webhooks/whatsapp"],
      },
    ],
  },
  {
    id: "settings-notifications",
    name: "Settings, Notifications, and Push",
    category: "account",
    routes: ["/settings"],
    apiEndpoints: ["/api/v1/notification-prefs", "/api/push/[...path]"],
    serverFiles: [
      "app/api/v1/notification-prefs/route.ts",
      "app/api/push/[...path]/route.ts",
      "lib/server/routes/notification-prefs/runner.ts",
      "lib/notifications/prefs.ts",
      "lib/push/push-sender.ts",
    ],
    clientFiles: [
      "app/settings/page.tsx",
      "hooks/chat/useChatSettings.ts",
    ],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Cloudflare KV", "Web Push"],
    benchmarkPriority: "P2",
    notes: "Push delivery itself should be mocked; preference reads provide stable route/API baselines.",
    httpBenchmarks: [
      { id: "settings-page", target: "/settings", authMode: "required", expectedStatus: 200 },
    ],
    apiBenchmarks: [
      {
        id: "notification-prefs-route",
        target: "/api/v1/notification-prefs",
        authMode: "required",
        expectedStatus: [200, 401],
      },
    ],
    bundleBenchmarks: [
      {
        id: "settings-notifications-bundle",
        routes: ["/settings"],
        apiRoutes: ["/api/v1/notification-prefs"],
        importTargets: ["app/settings/page.tsx"],
      },
    ],
  },
  {
    id: "admin-observability",
    name: "Admin, Health, Analytics, and Observability",
    category: "operations",
    routes: ["/admin"],
    apiEndpoints: [
      "/api/health",
      "/api/v1/health",
      "/api/v1/admin/analytics",
      "/api/v1/admin/life-graph/backfill",
      "/api/v1/admin/users/[id]/plan",
      "/api/v1/admin/users/[id]/role",
      "/api/v1/client-errors",
    ],
    serverFiles: [
      "app/admin/page.tsx",
      "app/api/v1/health/route.ts",
      "app/api/v1/admin/analytics/route.ts",
      "lib/analytics/aggregator.ts",
      "lib/server/observability/logger.ts",
      "lib/server/observability/cost-tracker.ts",
      "lib/server/platform/bindings.ts",
    ],
    clientFiles: ["app/admin/page.tsx", "hooks/admin/useAnalytics.ts"],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "render-import-cost",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Cloudflare KV", "Cloudflare D1", "Cloudflare Vectorize", "Durable Objects", "Providers health probes"],
    benchmarkPriority: "P1",
    notes: "Health checks must report skipped probes instead of crashing when optional bindings are absent.",
    httpBenchmarks: [{ id: "admin-page", target: "/admin", authMode: "required", expectedStatus: [200, 401, 403] }],
    apiBenchmarks: [
      { id: "health-route", target: "/api/v1/health", authMode: "public", expectedStatus: 200 },
      {
        id: "admin-analytics-route",
        target: "/api/v1/admin/analytics",
        authMode: "required",
        expectedStatus: [200, 401, 403],
      },
    ],
    serverBenchmarks: [
      {
        id: "analytics-growth-rate",
        modulePath: "lib/analytics/aggregator.ts",
        exportName: "calculateGrowthRate",
        staticArgs: [125, 100],
        benchmarkType: "server-function-benchmark",
      },
      {
        id: "analytics-snapshot",
        modulePath: "lib/analytics/aggregator.ts",
        exportName: "buildAnalyticsSnapshot",
        fixtureModule: "benchmarks/fixtures/admin/analytics-snapshot.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "admin-bundle",
        routes: ["/admin"],
        apiRoutes: ["/api/v1/health", "/api/v1/admin/analytics"],
        importTargets: ["app/admin/page.tsx", "hooks/admin/useAnalytics.ts"],
      },
    ],
  },
] satisfies FeatureManifestEntry[]

export { featureManifest }

export const featureManifestById = new Map(featureManifest.map((feature) => [feature.id, feature]))

export const allFeatureIds = featureManifest.map((feature) => feature.id)
