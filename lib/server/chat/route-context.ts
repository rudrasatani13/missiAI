import { buildSystemPrompt } from "@/lib/ai/services/ai-service"
import { buildCacheKey, getCachedResponse } from "@/lib/server/cache/response-cache"
import { getLastUserMessageContent } from "@/lib/server/chat/shared"
import { logLatency, createTimer } from "@/lib/server/observability/logger"
import {
  setCachedChatContext,
  isContextCacheable,
} from "@/lib/server/chat/context-cache"
import type { ChatInput } from "@/lib/validation/schemas"
import type { KVStore, Message } from "@/types"

export interface ChatRouteContextParams {
  userId: string
  kv: KVStore | null
  input: ChatInput
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

export async function buildChatRouteContext({
  userId,
  kv,
  input,
}: ChatRouteContextParams): Promise<ChatRouteContextData> {
  const timer = createTimer()

  const userMessageText = getLastUserMessageContent(input.messages)
  const cacheKey = isContextCacheable(input.voiceMode) ? buildCacheKey(userMessageText, "assistant") : null

  // Check cache first
  if (cacheKey && kv) {
    const cached = await getCachedResponse(cacheKey)
    if (cached) {
      logLatency("buildChatRouteContext.cache_hit", userId, timer(), {})
      return {
        messages: input.messages,
        memories: "",
        systemPrompt: buildSystemPrompt("assistant"),
        maxOutputTokens: LIMITS.MAX_OUTPUT_TOKENS,
        userMessageText,
        cacheKey,
      }
    }
  }

  // Build context without memory or plugins (simplified for live voice-only app)
  const memories = ""
  const systemPrompt = buildSystemPrompt("assistant")

  // Cache the context if cacheable
  if (cacheKey && kv) {
    await setCachedChatContext(kv, userId, "assistant", input.messages, false, {
      memories,
      systemPrompt,
      model: "",
      maxOutputTokens: LIMITS.MAX_OUTPUT_TOKENS,
    })
  }

  logLatency("buildChatRouteContext", userId, timer(), {})

  return {
    messages: input.messages,
    memories,
    systemPrompt,
    maxOutputTokens: LIMITS.MAX_OUTPUT_TOKENS,
    userMessageText,
    cacheKey,
  }
}

export async function prepareChatRouteCacheHit(
  cacheKey: string,
  cachedResponse: string,
): Promise<PreparedChatRouteCacheHit> {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const chunks = cachedResponse.split("\n\n")
        for (const chunk of chunks) {
          if (chunk.trim()) {
            controller.enqueue(encoder.encode(chunk + "\n\n"))
          }
        }
        controller.close()
      } catch (error) {
        controller.error(error)
      }
    },
  })

  return {
    cacheKey,
    response: new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    }),
  }
}

// Re-export LIMITS for other modules
const LIMITS = {
  MAX_OUTPUT_TOKENS: 2048,
}
