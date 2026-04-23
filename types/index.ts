// ─── Message & Conversation ───────────────────────────────────────────────────

export type MessageRole = "user" | "assistant"

export interface Message {
  role: MessageRole
  content: string
  image?: string
}

// ─── AI / Personality ─────────────────────────────────────────────────────────

export type PersonalityKey = "assistant" | "bestfriend" | "professional" | "playful" | "mentor" | "custom"
export type AIProviderName = "gemini" | "openai" | "claude"

export interface AIServiceOptions {
  provider?: AIProviderName
  model?: string
  temperature?: number
  maxOutputTokens?: number
  timeoutMs?: number
  useGoogleSearch?: boolean
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export interface KVListKey {
  name: string
}

export interface KVListResult {
  keys: KVListKey[]
  list_complete: boolean
  cursor?: string
}

// Minimal KV interface — Cloudflare KV compatible, but not vendor-locked
export interface KVStore {
  get(key: string): Promise<string | null>
  get<T>(key: string, options: { type: 'json' }): Promise<T | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
  list?(options?: { prefix?: string; cursor?: string; limit?: number }): Promise<KVListResult>
}

// ─── Voice ────────────────────────────────────────────────────────────────────

export interface STTResult {
  text: string
  language: string
  confidence: number
}

// ─── API Response ─────────────────────────────────────────────────────────────

export interface APISuccessResponse<T = unknown> {
  success: true
  data?: T
}

export interface APIErrorResponse {
  success: false
  error: string
}

export type APIResponse<T = unknown> = APISuccessResponse<T> | APIErrorResponse
