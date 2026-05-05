import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import type { KVStore, Message } from "@/types"

export const CHAT_REQUEST_MAX_BODY_BYTES = 5_000_000

export function getChatKV(): KVStore | null {
  return getCloudflareKVBinding()
}

export function getLastUserMessageContent(messages: Message[]): string {
  const lastUserMessage = messages.filter((message) => message.role === "user").pop()
  return lastUserMessage?.content ?? ""
}
