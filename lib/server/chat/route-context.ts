import { buildSystemPrompt } from "@/lib/ai/services/ai-service"
import { estimateRequestTokens, LIMITS, truncateToTokenLimit } from "@/lib/memory/token-counter"
import { buildCacheKey, getCachedResponse } from "@/lib/server/cache/response-cache"
import { getEnv } from "@/lib/server/platform/env"
import { getLastUserMessageContent, loadLifeGraphMemoryContext } from "@/lib/server/chat/shared"
import { logLatency, createTimer } from "@/lib/server/observability/logger"
import {
  getCachedChatContext,
  setCachedChatContext,
  isContextCacheable,
} from "@/lib/server/chat/context-cache"
import type { ChatInput } from "@/lib/validation/schemas"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { KVStore, Message } from "@/types"

export interface ChatRouteContextParams {
  userId: string
  kv: KVStore | null
  input: ChatInput
  vectorizeEnv: VectorizeEnv | null
  onMemoryError?: (error: unknown) => void
  onPluginError?: (error: unknown) => void
}

export interface ChatRouteContextData {
  messages: Message[]
  memories: string
  systemPrompt: string
  maxOutputTokens: number
  userMessageText: string
  cacheKey: string | null
}

export interface PreparedChatRouteCacheHit {
  cacheKey: string
  response: Response
}

async function loadChatPluginContext(
  kv: KVStore,
  userId: string,
): Promise<string> {
  const { loadPluginContext } = await import("@/lib/plugins/data-fetcher")

  let googleClientId: string | undefined
  let googleClientSecret: string | undefined
  let notionApiKey: string | undefined
  try {
    const env = getEnv()
    googleClientId = env.GOOGLE_CLIENT_ID
    googleClientSecret = env.GOOGLE_CLIENT_SECRET
    notionApiKey = env.NOTION_API_KEY
  } catch {}

  return loadPluginContext(kv, userId, googleClientId, googleClientSecret, notionApiKey)
}

function buildCachedChatResponse(cached: string): Response {
  const encoder = new TextEncoder()
  const cachedStream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ text: cached })}\n\n`),
      )
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })

  return new Response(cachedStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  })
}

export async function buildChatRouteContext({
  userId,
  kv,
  input,
  vectorizeEnv,
  onMemoryError,
  onPluginError,
}: ChatRouteContextParams): Promise<ChatRouteContextData> {
  const ctxTimer = createTimer()
  let { messages } = input
  const { personality, customPrompt, aiDials, incognito } = input
  const maxOutputTokens = input.maxOutputTokens ?? 600
  const clientMemories = incognito ? "" : (input.memories ?? "")

  // ── Try context cache first ────────────────────────────────────────────────
  const cacheable = isContextCacheable(input.voiceMode, !!input.examBuddy)
  if (cacheable && kv) {
    const cached = await getCachedChatContext(kv, userId, personality, messages, incognito)
    if (cached) {
      const { memories: cachedMemories, systemPrompt: cachedSystemPrompt, maxOutputTokens: cachedMaxTokens } = cached
      const estimatedTokens = estimateRequestTokens(messages, cachedSystemPrompt, cachedMemories)
      if (estimatedTokens > LIMITS.WARN_THRESHOLD) messages = truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)

      const userMessageText = getLastUserMessageContent(messages)
      const cacheKey = buildCacheKey(userMessageText, personality)

      logLatency("chat.latency.context_build", userId, ctxTimer(), {
        incognito,
        cacheHit: true,
        hasPluginContext: false,
      })

      return {
        messages,
        memories: cachedMemories,
        systemPrompt: cachedSystemPrompt,
        maxOutputTokens: cachedMaxTokens,
        userMessageText,
        cacheKey,
      }
    }
  }

  // Parallel independent fetches — memory context and plugin context have no
  // data dependency on each other, so they can resolve concurrently.
  const [rawMemories, pluginContext] = await Promise.all([
    loadLifeGraphMemoryContext({
      kv,
      vectorizeEnv,
      userId,
      messages,
      skip: incognito,
      onError: onMemoryError,
    }),
    (kv && !incognito) ? loadChatPluginContext(kv, userId).catch((error: unknown) => {
      onPluginError?.(error)
      return ""
    }) : Promise.resolve(""),
  ])

  let memories = rawMemories
  if (pluginContext) {
    memories = memories ? `${memories}\n\n${pluginContext}` : pluginContext
  }
  if (clientMemories) {
    memories = memories ? `${memories}\n${clientMemories}` : clientMemories
  }

  const systemPrompt = buildSystemPrompt(personality, memories, customPrompt, aiDials)
  const estimatedTokens = estimateRequestTokens(messages, systemPrompt, memories)
  if (estimatedTokens > LIMITS.WARN_THRESHOLD) {
    messages = truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)
  }

  const userMessageText = getLastUserMessageContent(messages)
  const cacheKey = buildCacheKey(userMessageText, personality)

  logLatency("chat.latency.context_build", userId, ctxTimer(), {
    incognito,
    hasPluginContext: !!pluginContext,
    cacheHit: false,
  })

  // Store for next turn if cacheable
  if (cacheable && kv) {
    await setCachedChatContext(kv, userId, personality, messages, incognito, {
      memories,
      systemPrompt,
      model: "", // model selected downstream in runner, not cached here
      maxOutputTokens,
      availableDeclarations: [],
    })
  }

  return {
    messages,
    memories,
    systemPrompt,
    maxOutputTokens,
    userMessageText,
    cacheKey,
  }
}

export async function prepareChatRouteCacheHit(
  cacheKey: string | null,
  onError?: (error: unknown) => void,
): Promise<PreparedChatRouteCacheHit | null> {
  if (!cacheKey) {
    return null
  }

  try {
    const cached = await getCachedResponse(cacheKey)
    if (!cached) {
      return null
    }

    return {
      cacheKey,
      response: buildCachedChatResponse(cached),
    }
  } catch (error) {
    onError?.(error)
    return null
  }
}
