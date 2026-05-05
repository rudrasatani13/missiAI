import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { loadLifeGraphMemoryContext } from "@/lib/server/chat/shared"
import { buildSystemPrompt, buildVoiceSystemPrompt } from "@/lib/ai/services/ai-service"
import { estimateRequestTokens, LIMITS, truncateToTokenLimit } from "@/lib/memory/token-counter"
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
  vectorizeEnv: VectorizeEnv | null
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
  vectorizeEnv,
}: ChatStreamContextParams): Promise<ChatStreamContextData> {
  const ctxTimer = createTimer()
  let { messages } = input
  const { personality, voiceMode, customPrompt, aiDials, incognito } = input
  const maxOutputTokens = voiceMode ? 800 : (input.maxOutputTokens ?? 600)
  const clientMemories = incognito ? "" : (input.memories ?? "")

  // ── Try context cache first ────────────────────────────────────────────────
  // Skip if voiceMode — voice requests have dynamic modifiers.
  const cacheable = isContextCacheable(voiceMode)
  if (cacheable && kv) {
    const cached = await getCachedChatContext(kv, userId, personality, messages, incognito)
    if (cached) {
      const { memories: cachedMemories, systemPrompt: cachedSystemPrompt, model: cachedModel, maxOutputTokens: cachedMaxTokens } = cached
      const estimatedTokens = estimateRequestTokens(messages, cachedSystemPrompt, cachedMemories)
      if (estimatedTokens > LIMITS.WARN_THRESHOLD) messages = truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)
      const inputTokens = estimateRequestTokens(messages, cachedSystemPrompt, cachedMemories)

      logLatency("chat.latency.context_build", userId, ctxTimer(), {
        voiceMode,
        incognito,
        cacheHit: true,
      })

      return {
        messages,
        memories: cachedMemories,
        systemPrompt: cachedSystemPrompt,
        inputTokens,
        model: cachedModel,
        maxOutputTokens: cachedMaxTokens,
      }
    }
  }

  // ── Phase 1: Parallel independent fetches ──────────────────────────────────
  // Memory and Google tokens run in parallel with their own error boundaries.
  // Spaces fan-out was removed in 2026-05.
  const rawMemories = await loadLifeGraphMemoryContext({
    kv,
    vectorizeEnv,
    userId,
    messages,
    skip: incognito,
  })

  let memories = rawMemories
  if (clientMemories) memories = memories ? `${memories}\n${clientMemories}` : clientMemories

  // ── Phase 2: Build system prompt (depends on memories) ─────────────────────
  const systemPrompt = voiceMode
    ? buildVoiceSystemPrompt(personality, memories, customPrompt, aiDials)
    : buildSystemPrompt(personality, memories, customPrompt, aiDials)

  // ── Phase 4: Token budgeting + model selection ─────────────────────────────
  const estimatedTokens = estimateRequestTokens(messages, systemPrompt, memories)
  if (estimatedTokens > LIMITS.WARN_THRESHOLD) messages = truncateToTokenLimit(messages, LIMITS.WARN_THRESHOLD)
  const inputTokens = estimateRequestTokens(messages, systemPrompt, memories)

  const model = selectGeminiModel(messages, memories)

  logLatency("chat.latency.context_build", userId, ctxTimer(), {
    voiceMode,
    incognito,
    cacheHit: false,
  })

  // Store for next turn if cacheable
  if (cacheable && kv) {
    await setCachedChatContext(kv, userId, personality, messages, incognito, {
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
    inputTokens,
    model,
    maxOutputTokens,
  }
}
