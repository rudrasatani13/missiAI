// ─── Bot Message Processing Pipeline ─────────────────────────────────────────
//
// Non-streaming Gemini pipeline for WhatsApp and Telegram bot responses.
// Reuses the existing AI service and memory layers — no duplication.
//
// Flow:
//   1. Search Life Graph for relevant memories (6 s timeout)
//   2. Build system prompt with platform-specific modifier appended
//   3. Call Gemini via callAIDirect (no streaming, no TTS)
//   4. Fire-and-forget: extract life nodes from the exchange and persist

import { searchLifeGraph, formatLifeGraphForPrompt, addOrUpdateNodes } from '@/lib/memory/life-graph'
import { buildSystemPrompt, callAIDirect } from '@/services/ai.service'
import { extractLifeNodes } from '@/lib/memory/graph-extractor'
import { sanitizeInput } from '@/lib/validation/sanitizer'
import type { KVStore } from '@/types'
import type { VectorizeEnv } from '@/lib/memory/vectorize'
import type { BotPlatform } from '@/lib/bot/bot-auth'
import type { ConversationEntry } from '@/types/chat'

// ─── Bot-specific system prompt modifier ─────────────────────────────────────
//
// Appended after the base personality prompt so platform constraints take
// priority over the base voice/TTS rules.
const BOT_MODIFIER = `
BOT CHANNEL RULES (non-negotiable):
- You are responding via a messaging app (WhatsApp or Telegram). NOT a voice call.
- Keep your reply concise: 1–3 short paragraphs maximum.
- No markdown formatting (no **bold**, no *italic*, no bullet lists, no headers).
- No emojis unless the user used them first.
- No TTS output — text only.
- Hinglish tone must feel natural and warm, like a real friend texting you.
- If you reference a URL, write it as plain text — no markdown link syntax.
`.trim()

const MEMORY_TIMEOUT_MS = 6_000

export interface BotProcessOptions {
  kv: KVStore
  vectorizeEnv: VectorizeEnv | null
  userId: string
  messageText: string
  platform: BotPlatform
}

export async function processBotMessage(opts: BotProcessOptions): Promise<string> {
  const { kv, vectorizeEnv, userId, platform } = opts

  // Sanitize user message text before any AI or storage operation.
  // Prevents prompt injection attacks delivered via WhatsApp/Telegram.
  const messageText = sanitizeInput(opts.messageText)

  // ── 1. Fetch relevant memories ────────────────────────────────────────────
  let memories = ''
  try {
    const memResults = await Promise.race([
      searchLifeGraph(kv, vectorizeEnv, userId, messageText, { topK: 5 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('memory timeout')), MEMORY_TIMEOUT_MS),
      ),
    ])
    memories = formatLifeGraphForPrompt(memResults)
  } catch {
    // Non-critical — continue without memories
  }

  // ── 2. Build system prompt ────────────────────────────────────────────────
  const basePrompt = buildSystemPrompt('bestfriend', memories)
  const platformLabel = platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'
  const systemPrompt = `${basePrompt}\n\n${BOT_MODIFIER}\n\nCurrent channel: ${platformLabel}`

  // ── 3. Call Gemini (non-streaming) ────────────────────────────────────────
  const response = await callAIDirect(systemPrompt, messageText, {
    model: 'gemini-2.5-flash',
    temperature: 0.85,
    maxOutputTokens: 500,
  })

  // ── 4. Fire-and-forget memory extraction ─────────────────────────────────
  const conversation: ConversationEntry[] = [
    { role: 'user', content: messageText },
    { role: 'assistant', content: response },
  ]

  // Use source field to tag bot-originated memory nodes
  fireAndForgetMemoryExtraction(kv, vectorizeEnv, userId, conversation, platform)

  return response || 'Kuch gadbad ho gayi — please thodi der baad try karo!'
}

// ─── Memory extraction (non-blocking) ────────────────────────────────────────

function fireAndForgetMemoryExtraction(
  kv: KVStore,
  vectorizeEnv: VectorizeEnv | null,
  userId: string,
  conversation: ConversationEntry[],
  platform: BotPlatform,
): void {
  ;(async () => {
    try {
      // Need existing graph for dedup — load it inline (graph-extractor needs it)
      const { getLifeGraph } = await import('@/lib/memory/life-graph')
      const existingGraph = await getLifeGraph(kv, userId)
      const extracted = await extractLifeNodes(conversation, existingGraph)

      if (extracted.length === 0) return

      await addOrUpdateNodes(
        kv,
        vectorizeEnv,
        userId,
        extracted.map((n) => ({ ...n, userId, source: 'conversation' as const })),
      )
    } catch {
      // Never let memory errors surface — this is purely additive
    }
  })().catch(() => {})
}
