import { buildSystemPrompt, buildVoiceSystemPrompt } from "@/lib/ai/services/ai-service"
import { selectGeminiModel } from "@/lib/ai/providers/model-router"
import type { ChatInput } from "@/lib/validation/schemas"
import type { KVStore, Message } from "@/types"
import { logLatency, createTimer } from "@/lib/server/observability/logger"
import {
  getCachedChatContext,
  setCachedChatContext,
  isContextCacheable,
} from "@/lib/server/chat/context-cache"

export interface ChatStreamContextParams {
  userId: string
  kv: KVStore | null
  input: ChatInput
}

export interface ChatStreamContextData {
  messages: Message[]
  memories: string
  systemPrompt: string
  inputTokens: number
  model: string
  maxOutputTokens: number
}

export async function buildChatStreamContext({
  userId,
  kv,
  input,
}: ChatStreamContextParams): Promise<ChatStreamContextData> {
  const ctxTimer = createTimer()
  let { messages } = input
  const { voiceMode, customPrompt } = input
  const maxOutputTokens = voiceMode ? 800 : (input.maxOutputTokens ?? 600)

  // ── Try context cache first ────────────────────────────────────────────────
  const cacheable = isContextCacheable(voiceMode)
  if (cacheable && kv) {
    const cached = await getCachedChatContext(kv, userId, "", messages, false)
    if (cached) {
      const { memories: cachedMemories, systemPrompt: cachedSystemPrompt, model: cachedModel, maxOutputTokens: cachedMaxTokens } = cached

      logLatency("chat.latency.context_build", userId, ctxTimer(), {
        voiceMode,
        incognito: false,
        cacheHit: true,
      })

      return {
        messages,
        memories: cachedMemories,
        systemPrompt: cachedSystemPrompt,
        inputTokens: 0, // Simplified - no token estimation
        model: cachedModel,
        maxOutputTokens: cachedMaxTokens,
      }
    }
  }

  // ── Build context without memory (simplified for live voice-only app) ───────
  const memories = ""
  const systemPrompt = voiceMode ? buildVoiceSystemPrompt("assistant", memories, customPrompt, {}) : buildSystemPrompt("assistant", memories, customPrompt, {})

  // ── Model selection ────────────────────────────────────────────────────────
  const model = selectGeminiModel(messages, memories)

  logLatency("chat.latency.context_build", userId, ctxTimer(), {
    voiceMode,
    incognito: false,
    cacheHit: false,
  })

  // Store for next turn if cacheable
  if (cacheable && kv) {
    await setCachedChatContext(kv, userId, "", messages, false, {
      memories,
      systemPrompt,
      model,
      maxOutputTokens,
    })
  }

  return {
    messages,
    memories,
    systemPrompt,
    inputTokens: 0,
    model,
    maxOutputTokens,
  }
}
