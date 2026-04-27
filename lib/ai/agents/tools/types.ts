import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { ToolExecutionSurface } from "@/lib/ai/agents/tools/registry"
import type { KVStore } from "@/types"

export interface AgentToolCall {
  name: string
  args: Record<string, unknown>
}

export interface AgentStepResult {
  toolName: string
  status: "running" | "done" | "error"
  summary: string
  output: string
}

export interface ToolContext {
  kv: KVStore | null
  vectorizeEnv: VectorizeEnv | null
  userId: string
  executionSurface?: ToolExecutionSurface
  abortSignal?: AbortSignal
  googleClientId?: string
  googleClientSecret?: string
  resendApiKey?: string
}
