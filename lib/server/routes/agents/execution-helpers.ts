import type { ToolContext } from "@/lib/ai/agents/tools/types"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from "@/lib/server/platform/bindings"
import { getEnv } from "@/lib/server/platform/env"
import type { KVStore } from "@/types"

export interface BuildAgentToolContextOptions {
  kv?: KVStore | null
  vectorizeEnv?: VectorizeEnv | null
  includeResendApiKey?: boolean
}

export function buildAgentToolContext(
  userId: string,
  options: BuildAgentToolContextOptions = {},
): ToolContext {
  const appEnv = getEnv()

  return {
    kv: options.kv === undefined ? getCloudflareKVBinding() : options.kv,
    vectorizeEnv: options.vectorizeEnv === undefined ? getCloudflareVectorizeEnv() : options.vectorizeEnv,
    userId,
    googleClientId: appEnv.GOOGLE_CLIENT_ID,
    googleClientSecret: appEnv.GOOGLE_CLIENT_SECRET,
    resendApiKey: options.includeResendApiKey ? appEnv.RESEND_API_KEY : undefined,
  }
}
