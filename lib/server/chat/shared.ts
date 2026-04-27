import { searchLifeGraph, formatLifeGraphForPrompt, MEMORY_TIMEOUT_MS } from "@/lib/memory/life-graph"
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from "@/lib/server/platform/bindings"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { KVStore, Message } from "@/types"

export const CHAT_REQUEST_MAX_BODY_BYTES = 5_000_000
export const CHAT_MEMORY_TOP_K = 5

export function getChatKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export function getChatVectorizeEnv(): VectorizeEnv | null {
  return getCloudflareVectorizeEnv()
}

export interface LoadLifeGraphMemoryContextParams {
  kv: KVStore | null
  vectorizeEnv: VectorizeEnv | null
  userId: string
  messages: Message[]
  skip?: boolean
  onError?: (error: unknown) => void
}

export function getLastUserMessageContent(messages: Message[]): string {
  const lastUserMessage = messages.filter((message) => message.role === "user").pop()
  return lastUserMessage?.content ?? ""
}

export async function loadLifeGraphMemoryContext({
  kv,
  vectorizeEnv,
  userId,
  messages,
  skip,
  onError,
}: LoadLifeGraphMemoryContextParams): Promise<string> {
  if (!kv || skip) {
    return ""
  }

  try {
    const currentMessage = getLastUserMessageContent(messages)
    const memoryPromise = searchLifeGraph(kv, vectorizeEnv, userId, currentMessage, { topK: CHAT_MEMORY_TOP_K })
    let timeoutId: ReturnType<typeof setTimeout>
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Memory search timeout")), MEMORY_TIMEOUT_MS)
    })

    try {
      const results = await Promise.race([memoryPromise, timeoutPromise])
      return formatLifeGraphForPrompt(results)
    } finally {
      clearTimeout(timeoutId!)
    }
  } catch (error) {
    onError?.(error)
    return ""
  }
}
