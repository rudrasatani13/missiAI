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
      "components/landing/AgenticMissiHome.tsx",
      "components/landing/ProductShowcase.tsx",
    ],
    benchmarkTypes: ["http-route-latency", "build-time", "bundle-size", "render-import-cost"],
    authRequired: false,
    externalServices: ["Static assets", "Next.js App Router"],
    benchmarkPriority: "P3",
    notes: "Public entry surfaces should stay fast on cold loads and mobile networks.",
    httpBenchmarks: [
      { id: "landing-page", target: "/", authMode: "public", expectedStatus: 200 },
      { id: "manifesto-page", target: "/manifesto", authMode: "public", expectedStatus: 200 },
      { id: "privacy-page", target: "/privacy", authMode: "public", expectedStatus: 200 },
      { id: "terms-page", target: "/terms", authMode: "public", expectedStatus: 200 },
    ],
    bundleBenchmarks: [
      {
        id: "public-marketing-bundle",
        routes: ["/", "/manifesto", "/privacy", "/terms"],
        importTargets: ["app/page.tsx", "components/landing/AgenticMissiHome.tsx"],
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
    name: "Memory Dashboard and Life Graph",
    category: "memory",
    routes: ["/memory", "/memory/graph"],
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
      "app/memory/graph/page.tsx",
      "hooks/memory/useMemoryDashboard.ts",
      "components/memory/GroupedMemoryView.tsx",
      "components/memory/MemoryGraph3D.tsx",
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
    notes: "Graph formatting can run locally, but extraction and vector search should default to mock fixtures.",
    httpBenchmarks: [
      { id: "memory-page", target: "/memory", authMode: "required", expectedStatus: 200 },
      { id: "memory-graph-page", target: "/memory/graph", authMode: "required", expectedStatus: 200 },
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
        routes: ["/memory", "/memory/graph"],
        apiRoutes: ["/api/v1/memory"],
        importTargets: ["app/memory/page.tsx", "components/memory/MemoryGraph3D.tsx"],
      },
    ],
  },
  {
    id: "visual-memory-life-story",
    name: "Visual Memory and Life Story",
    category: "memory",
    routes: ["/memory/visual", "/memory/story"],
    apiEndpoints: ["/api/v1/visual-memory/[[...path]]", "/api/v1/life-story/[...path]"],
    serverFiles: [
      "app/api/v1/visual-memory/[[...path]]/route.ts",
      "app/api/v1/life-story/[...path]/route.ts",
      "lib/server/routes/visual-memory/runner.ts",
      "lib/server/routes/life-story/runner.ts",
      "lib/visual-memory/image-analyzer.ts",
      "lib/life-story/year-review-generator.ts",
    ],
    clientFiles: [
      "app/memory/visual/page.tsx",
      "app/memory/story/page.tsx",
      "components/memory/VisualMemoryGallery.tsx",
      "components/memory/LifeStoryView.tsx",
      "components/memory/ConstellationView.tsx",
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
    externalServices: ["Clerk", "Cloudflare KV", "Cloudflare Vectorize", "Gemini Vision"],
    benchmarkPriority: "P1",
    notes: "Image analysis and story generation should be benchmarked with saved fixtures unless explicitly opted into live providers.",
    httpBenchmarks: [
      { id: "visual-memory-page", target: "/memory/visual", authMode: "required", expectedStatus: 200 },
      { id: "life-story-page", target: "/memory/story", authMode: "required", expectedStatus: 200 },
    ],
    apiBenchmarks: [
      {
        id: "visual-memory-route",
        target: "/api/v1/visual-memory/entries",
        authMode: "required",
        expectedStatus: [200, 401, 404],
        notes: "Use a concrete sub-path when the fixture suite is added.",
      },
      {
        id: "life-story-route",
        target: "/api/v1/life-story/summary",
        authMode: "required",
        expectedStatus: [200, 401, 404],
        notes: "Catch-all route expects a concrete sub-path in fixtures.",
      },
    ],
    serverBenchmarks: [
      {
        id: "map-visual-memory-node",
        modulePath: "lib/visual-memory/image-analyzer.ts",
        exportName: "mapExtractionToLifeNode",
        staticArgs: [
          {
            title: "Roadmap whiteboard",
            detail: "A whiteboard with a product roadmap and delivery checkpoints.",
            category: "document",
            tags: ["planning", "work", "roadmap"],
            people: ["Missi Team"],
            emotionalWeight: 0.4,
            structuredData: "milestones=4; owner=product",
          },
          "user_fixture",
        ],
      },
    ],
    bundleBenchmarks: [
      {
        id: "visual-memory-bundle",
        routes: ["/memory/visual", "/memory/story"],
        apiRoutes: ["/api/v1/visual-memory/[[...path]]", "/api/v1/life-story/[...path]"],
        importTargets: ["components/memory/VisualMemoryGallery.tsx", "components/memory/LifeStoryView.tsx"],
      },
    ],
  },
  {
    id: "spaces",
    name: "Spaces Collaboration",
    category: "collaboration",
    routes: ["/spaces", "/spaces/[spaceId]", "/join/[token]"],
    apiEndpoints: [
      "/api/v1/spaces",
      "/api/v1/spaces/join",
      "/api/v1/spaces/[spaceId]",
      "/api/v1/spaces/[spaceId]/invite",
      "/api/v1/spaces/[spaceId]/members/[memberId]",
      "/api/v1/spaces/[spaceId]/memory",
      "/api/v1/spaces/[spaceId]/memory/[nodeId]",
      "/api/v1/spaces/[spaceId]/memory/share",
    ],
    serverFiles: [
      "app/api/v1/spaces/route.ts",
      "app/api/v1/spaces/[spaceId]/route.ts",
      "lib/spaces/space-store.ts",
      "lib/spaces/space-api-helpers.ts",
      "lib/spaces/plan-gate.ts",
    ],
    clientFiles: [
      "app/spaces/page.tsx",
      "app/spaces/[spaceId]/page.tsx",
      "components/spaces/SpacesDashboard.tsx",
      "components/spaces/SpaceDetailView.tsx",
      "components/spaces/SpaceCard.tsx",
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
    externalServices: ["Clerk", "Cloudflare KV", "Cloudflare Vectorize", "Billing plan gate"],
    benchmarkPriority: "P1",
    notes: "Shared graph mutations and invite flows should be measured separately from read-only dashboards.",
    httpBenchmarks: [
      { id: "spaces-page", target: "/spaces", authMode: "required", expectedStatus: 200 },
      { id: "join-page", target: "/join/fake-token", authMode: "public", expectedStatus: [200, 404] },
    ],
    apiBenchmarks: [
      { id: "spaces-route", target: "/api/v1/spaces", authMode: "required", expectedStatus: [200, 401, 403] },
      {
        id: "space-detail-route",
        target: "/api/v1/spaces/fixture-space",
        authMode: "required",
        expectedStatus: [200, 401, 403, 404],
      },
    ],
    serverBenchmarks: [
      {
        id: "space-role-resolution",
        modulePath: "lib/spaces/space-store.ts",
        exportName: "roleForUser",
        staticArgs: [
          {
            ownerId: "owner_fixture",
            members: [{ userId: "member_fixture", role: "member" }],
          },
          "member_fixture",
        ],
      },
    ],
    bundleBenchmarks: [
      {
        id: "spaces-bundle",
        routes: ["/spaces", "/spaces/[spaceId]", "/join/[token]"],
        apiRoutes: ["/api/v1/spaces", "/api/v1/spaces/[spaceId]"],
        importTargets: ["components/spaces/SpacesDashboard.tsx", "components/spaces/SpaceDetailView.tsx"],
      },
    ],
  },
  {
    id: "budget",
    name: "Budget Tracking",
    category: "finance",
    routes: ["/budget"],
    apiEndpoints: [
      "/api/v1/budget/entries",
      "/api/v1/budget/entries/[entryId]",
      "/api/v1/budget/settings",
      "/api/v1/budget/report",
      "/api/v1/budget/insight",
      "/api/v1/budget/export",
    ],
    serverFiles: [
      "lib/budget/budget-store.ts",
      "lib/budget/budget-record-store.ts",
      "lib/budget/insight-generator.ts",
      "lib/budget/kv.ts",
      "workers/durable-objects/atomic-counter.ts",
    ],
    clientFiles: ["app/budget/page.tsx", "hooks/billing/useBilling.ts"],
    benchmarkTypes: [
      "http-route-latency",
      "api-latency",
      "server-function-benchmark",
      "bundle-size",
      "memory-usage",
      "mocked-integration-benchmark",
    ],
    authRequired: true,
    externalServices: ["Clerk", "Cloudflare KV", "Durable Objects", "Gemini"],
    benchmarkPriority: "P1",
    notes: "Report and insight generation should separate pure aggregation from provider-backed insight generation.",
    httpBenchmarks: [{ id: "budget-page", target: "/budget", authMode: "required", expectedStatus: 200 }],
    apiBenchmarks: [
      { id: "budget-entries-route", target: "/api/v1/budget/entries", authMode: "required", expectedStatus: [200, 401] },
      {
        id: "budget-insight-route",
        target: "/api/v1/budget/insight",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 400, 401, 429, 503],
        requiresMocking: true,
      },
    ],
    serverBenchmarks: [
      {
        id: "budget-monthly-totals",
        modulePath: "lib/budget/budget-store.ts",
        exportName: "buildMonthlyTotals",
        fixtureModule: "benchmarks/fixtures/budget/monthly-totals.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "budget-bundle",
        routes: ["/budget"],
        apiRoutes: ["/api/v1/budget/entries", "/api/v1/budget/insight"],
        importTargets: ["app/budget/page.tsx"],
      },
    ],
  },
  {
    id: "billing-referrals",
    name: "Billing, Pricing, and Referrals",
    category: "revenue",
    routes: ["/pricing"],
    apiEndpoints: ["/api/v1/billing", "/api/v1/referral", "/api/webhooks/dodo"],
    serverFiles: [
      "app/api/v1/billing/route.ts",
      "app/api/v1/referral/route.ts",
      "app/api/webhooks/dodo/route.ts",
      "lib/server/routes/billing/runner.ts",
      "lib/server/routes/referral/runner.ts",
      "lib/billing/dodo-client.ts",
      "lib/billing/referral.ts",
      "lib/billing/tier-checker.ts",
    ],
    clientFiles: [
      "app/pricing/page.tsx",
      "hooks/billing/useBilling.ts",
      "hooks/billing/useReferral.ts",
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
    notes: "Checkout, plan refresh, and referral bookkeeping should never require live payment traffic in benchmark mode.",
    httpBenchmarks: [{ id: "pricing-page", target: "/pricing", authMode: "public", expectedStatus: 200 }],
    apiBenchmarks: [
      { id: "billing-route", target: "/api/v1/billing", authMode: "required", expectedStatus: [200, 401, 503] },
      { id: "referral-route", target: "/api/v1/referral", authMode: "required", expectedStatus: [200, 401] },
      {
        id: "dodo-webhook",
        target: "/api/webhooks/dodo",
        method: "POST",
        authMode: "public",
        expectedStatus: [200, 400, 401, 500],
        requiresMocking: true,
      },
    ],
    serverBenchmarks: [
      {
        id: "referral-state-transition",
        modulePath: "lib/billing/referral.ts",
        exportName: "trackReferral",
        fixtureModule: "benchmarks/fixtures/billing/referral.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "billing-bundle",
        routes: ["/pricing"],
        apiRoutes: ["/api/v1/billing", "/api/v1/referral", "/api/webhooks/dodo"],
        importTargets: ["app/pricing/page.tsx", "hooks/billing/useBilling.ts"],
      },
    ],
  },
  {
    id: "quests-streaks",
    name: "Quests and Streaks",
    category: "gamification",
    routes: ["/quests", "/streak"],
    apiEndpoints: [
      "/api/v1/quests",
      "/api/v1/quests/stats",
      "/api/v1/quests/[questId]",
      "/api/v1/quests/[questId]/boss-token",
      "/api/v1/quests/[questId]/missions/[missionId]/complete",
      "/api/v1/streak",
    ],
    serverFiles: [
      "app/api/v1/quests/route.ts",
      "lib/server/routes/quests/runner.ts",
      "lib/server/routes/streak/runner.ts",
      "lib/quests/quest-generator.ts",
      "lib/quests/quest-store.ts",
      "lib/gamification/streak.ts",
    ],
    clientFiles: [
      "app/quests/page.tsx",
      "app/streak/page.tsx",
      "hooks/quests/useQuests.ts",
      "hooks/gamification/useStreak.ts",
      "components/quests/QuestsClient.tsx",
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
    benchmarkPriority: "P2",
    notes: "Quest generation uses AI; streak reads are a cheaper baseline for cold and warm KV behavior.",
    httpBenchmarks: [
      { id: "quests-page", target: "/quests", authMode: "required", expectedStatus: 200 },
      { id: "streak-page", target: "/streak", authMode: "required", expectedStatus: 200 },
    ],
    apiBenchmarks: [
      { id: "quests-route", target: "/api/v1/quests", authMode: "required", expectedStatus: [200, 401] },
      { id: "streak-route", target: "/api/v1/streak", authMode: "required", expectedStatus: [200, 401] },
    ],
    serverBenchmarks: [
      {
        id: "sanitize-quest-text",
        modulePath: "lib/quests/quest-generator.ts",
        exportName: "sanitizeQuestText",
        staticArgs: ["Build a benchmark plan with concrete metrics and no fluff.", 120],
      },
    ],
    bundleBenchmarks: [
      {
        id: "quests-bundle",
        routes: ["/quests", "/streak"],
        apiRoutes: ["/api/v1/quests", "/api/v1/streak"],
        importTargets: ["components/quests/QuestsClient.tsx"],
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
    id: "sleep-wind-down",
    name: "Sleep Sessions and Wind Down",
    category: "wellbeing",
    routes: ["/wind-down"],
    apiEndpoints: ["/api/v1/wind-down", "/api/v1/sleep-sessions/[...path]"],
    serverFiles: [
      "app/api/v1/wind-down/route.ts",
      "app/api/v1/sleep-sessions/[...path]/route.ts",
      "lib/server/routes/wind-down/runner.ts",
      "lib/server/routes/sleep-sessions/runner.ts",
      "lib/sleep-sessions/story-generator.ts",
      "lib/sleep-sessions/session-store.ts",
    ],
    clientFiles: [
      "app/wind-down/page.tsx",
      "hooks/wind-down/useWindDown.ts",
      "hooks/wind-down/useSleepSessions.ts",
      "components/wind-down/SleepSessions.tsx",
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
    externalServices: ["Clerk", "Cloudflare KV", "Gemini", "Gemini TTS"],
    benchmarkPriority: "P2",
    notes: "Reflection reads and session CRUD can run without provider traffic; custom story generation should stay mocked.",
    httpBenchmarks: [{ id: "wind-down-page", target: "/wind-down", authMode: "required", expectedStatus: 200 }],
    apiBenchmarks: [
      { id: "wind-down-route", target: "/api/v1/wind-down", authMode: "required", expectedStatus: [200, 401] },
      {
        id: "sleep-sessions-route",
        target: "/api/v1/sleep-sessions/list",
        authMode: "required",
        expectedStatus: [200, 401, 404],
        notes: "Catch-all route expects a concrete sub-path in fixtures.",
      },
    ],
    serverBenchmarks: [
      {
        id: "sanitize-story-text",
        modulePath: "lib/sleep-sessions/story-generator.ts",
        exportName: "sanitizeStoryText",
        staticArgs: ["  Gentle breathing...   Relax   into sleep.  "],
      },
    ],
    bundleBenchmarks: [
      {
        id: "wind-down-bundle",
        routes: ["/wind-down"],
        apiRoutes: ["/api/v1/wind-down", "/api/v1/sleep-sessions/[...path]"],
        importTargets: ["app/wind-down/page.tsx", "components/wind-down/SleepSessions.tsx"],
      },
    ],
  },
  {
    id: "exam-buddy",
    name: "Exam Buddy",
    category: "education",
    routes: ["/exam-buddy"],
    apiEndpoints: [
      "/api/v1/exam-buddy/profile",
      "/api/v1/exam-buddy/sessions",
      "/api/v1/exam-buddy/weak-topics",
      "/api/v1/exam-buddy/quiz",
      "/api/v1/exam-buddy/quiz/[sessionId]/submit",
    ],
    serverFiles: [
      "app/api/v1/exam-buddy/quiz/route.ts",
      "lib/exam-buddy/quiz-generator.ts",
      "lib/exam-buddy/profile-store.ts",
      "lib/exam-buddy/limits.ts",
      "lib/exam-buddy/session-token.ts",
    ],
    clientFiles: [
      "app/exam-buddy/page.tsx",
      "components/exam-buddy/ExamBuddyHub.tsx",
      "components/exam-buddy/QuizCreator.tsx",
      "components/exam-buddy/QuizView.tsx",
      "components/exam-buddy/WeakTopicsCard.tsx",
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
    externalServices: ["Clerk", "Cloudflare KV", "Billing plan gate", "Gemini"],
    benchmarkPriority: "P1",
    notes: "Quiz generation should stay mocked; readback endpoints provide safer latency baselines.",
    httpBenchmarks: [{ id: "exam-buddy-page", target: "/exam-buddy", authMode: "required", expectedStatus: 200 }],
    apiBenchmarks: [
      {
        id: "exam-buddy-profile-route",
        target: "/api/v1/exam-buddy/profile",
        authMode: "required",
        expectedStatus: [200, 401],
      },
      {
        id: "exam-buddy-quiz-route",
        target: "/api/v1/exam-buddy/quiz",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 400, 401, 429, 503],
        requiresMocking: true,
      },
    ],
    serverBenchmarks: [
      {
        id: "exam-quiz-generator",
        modulePath: "lib/exam-buddy/quiz-generator.ts",
        exportName: "generateQuizWithDiagnostics",
        fixtureModule: "benchmarks/fixtures/exam-buddy/quiz-generator.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "exam-buddy-bundle",
        routes: ["/exam-buddy"],
        apiRoutes: ["/api/v1/exam-buddy/profile", "/api/v1/exam-buddy/quiz"],
        importTargets: ["components/exam-buddy/ExamBuddyHub.tsx", "components/exam-buddy/QuizView.tsx"],
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
      "/api/v1/tools/execute",
    ],
    serverFiles: [
      "app/api/v1/plugins/[[...path]]/route.ts",
      "app/api/v1/tools/execute/route.ts",
      "lib/server/routes/plugins/runner.ts",
      "lib/server/routes/tools/execute-helpers.ts",
      "lib/plugins/plugin-executor.ts",
      "lib/plugins/plugin-store.ts",
      "lib/plugins/notion-plugin.ts",
      "lib/plugins/calendar-plugin.ts",
    ],
    clientFiles: [
      "app/settings/integrations/page.tsx",
      "hooks/chat/usePlugins.ts",
      "components/chat/ActionCard.tsx",
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
      {
        id: "tools-execute-route",
        target: "/api/v1/tools/execute",
        method: "POST",
        authMode: "required",
        expectedStatus: [200, 400, 401],
        requiresMocking: true,
      },
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
        apiRoutes: ["/api/v1/plugins/[[...path]]", "/api/v1/tools/execute"],
        importTargets: ["app/settings/integrations/page.tsx", "hooks/chat/usePlugins.ts"],
      },
    ],
  },
  {
    id: "messaging-bots",
    name: "Messaging Bots and Public Webhooks",
    category: "integrations",
    routes: ["/settings/integrations", "/profile"],
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
    clientFiles: ["app/settings/integrations/page.tsx", "components/profile/ProfileCardClient.tsx"],
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
        routes: ["/settings/integrations", "/profile"],
        apiRoutes: ["/api/v1/bot/link/whatsapp", "/api/webhooks/telegram", "/api/webhooks/whatsapp"],
      },
    ],
  },
  {
    id: "agents-actions",
    name: "Agents, Actions, and Tool Execution",
    category: "automation",
    routes: ["/agents", "/chat"],
    apiEndpoints: ["/api/v1/agents/[...path]", "/api/v1/actions", "/api/v1/tools/execute"],
    serverFiles: [
      "app/api/v1/agents/[...path]/route.ts",
      "app/api/v1/actions/route.ts",
      "lib/server/routes/agents/plan-helpers.ts",
      "lib/server/routes/agents/confirm-runner.ts",
      "lib/actions/action-executor.ts",
      "lib/actions/action-registry.ts",
      "lib/ai/agents/planner.ts",
      "lib/ai/agents/tools/dispatcher.ts",
    ],
    clientFiles: [
      "app/agents/page.tsx",
      "components/agents/AgentDashboard.tsx",
      "hooks/chat/useActionEngine.ts",
      "components/chat/AgentSteps.tsx",
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
    externalServices: ["Clerk", "Cloudflare KV", "Cloudflare Vectorize", "Gemini", "Plugin connectors"],
    benchmarkPriority: "P1",
    notes: "Agent planning and action execution should be broken out from chat latency because they add extra reasoning and tool overhead.",
    httpBenchmarks: [{ id: "agents-page", target: "/agents", authMode: "required", expectedStatus: 200 }],
    apiBenchmarks: [
      { id: "actions-route", target: "/api/v1/actions", authMode: "required", expectedStatus: [200, 401] },
      {
        id: "agents-route",
        target: "/api/v1/agents/history",
        authMode: "required",
        expectedStatus: [200, 401, 404],
      },
    ],
    serverBenchmarks: [
      {
        id: "action-executor",
        modulePath: "lib/actions/action-executor.ts",
        exportName: "executeAction",
        fixtureModule: "benchmarks/fixtures/agents/action-executor.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "agents-bundle",
        routes: ["/agents", "/chat"],
        apiRoutes: ["/api/v1/agents/[...path]", "/api/v1/actions"],
        importTargets: ["components/agents/AgentDashboard.tsx", "hooks/chat/useActionEngine.ts"],
      },
    ],
  },
  {
    id: "profile-notifications",
    name: "Profile Card, Settings, Notifications, and Push",
    category: "account",
    routes: ["/profile", "/settings"],
    apiEndpoints: ["/api/v1/profile/card", "/api/v1/notification-prefs", "/api/push/[...path]"],
    serverFiles: [
      "app/api/v1/profile/card/route.ts",
      "app/api/v1/notification-prefs/route.ts",
      "app/api/push/[...path]/route.ts",
      "lib/server/routes/profile-card/runner.ts",
      "lib/server/routes/notification-prefs/runner.ts",
      "lib/notifications/prefs.ts",
      "lib/push/push-sender.ts",
    ],
    clientFiles: [
      "app/profile/page.tsx",
      "app/settings/page.tsx",
      "components/profile/ProfileCardClient.tsx",
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
    notes: "Push delivery itself should be mocked; profile and preference reads provide stable route/API baselines.",
    httpBenchmarks: [
      { id: "profile-page", target: "/profile", authMode: "required", expectedStatus: 200 },
      { id: "settings-page", target: "/settings", authMode: "required", expectedStatus: 200 },
    ],
    apiBenchmarks: [
      { id: "profile-card-route", target: "/api/v1/profile/card", authMode: "required", expectedStatus: [200, 401] },
      {
        id: "notification-prefs-route",
        target: "/api/v1/notification-prefs",
        authMode: "required",
        expectedStatus: [200, 401],
      },
    ],
    bundleBenchmarks: [
      {
        id: "profile-bundle",
        routes: ["/profile", "/settings"],
        apiRoutes: ["/api/v1/profile/card", "/api/v1/notification-prefs"],
        importTargets: ["components/profile/ProfileCardClient.tsx", "app/settings/page.tsx"],
      },
    ],
  },
  {
    id: "mood",
    name: "Mood Timeline",
    category: "wellbeing",
    routes: ["/mood"],
    apiEndpoints: ["/api/v1/mood/timeline"],
    serverFiles: [
      "app/api/v1/mood/timeline/route.ts",
      "lib/server/routes/mood/timeline-runner.ts",
      "lib/mood/mood-store.ts",
      "lib/mood/mood-analyzer.ts",
    ],
    clientFiles: ["app/mood/page.tsx", "components/mood/MoodTimelineClient.tsx"],
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
    benchmarkPriority: "P2",
    notes: "Mood analysis is provider-backed; timeline reads should remain benchmarkable with only KV.",
    httpBenchmarks: [{ id: "mood-page", target: "/mood", authMode: "required", expectedStatus: 200 }],
    apiBenchmarks: [
      { id: "mood-timeline-route", target: "/api/v1/mood/timeline", authMode: "required", expectedStatus: [200, 401] },
    ],
    serverBenchmarks: [
      {
        id: "mood-analyzer",
        modulePath: "lib/mood/mood-analyzer.ts",
        exportName: "analyzeMoodFromConversation",
        fixtureModule: "benchmarks/fixtures/mood/mood-analyzer.fixture.ts",
        benchmarkType: "mocked-integration-benchmark",
      },
    ],
    bundleBenchmarks: [
      {
        id: "mood-bundle",
        routes: ["/mood"],
        apiRoutes: ["/api/v1/mood/timeline"],
        importTargets: ["components/mood/MoodTimelineClient.tsx"],
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
      "/api/v1/admin/budget/backfill",
      "/api/v1/admin/life-graph/backfill",
      "/api/v1/admin/spaces/backfill",
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
