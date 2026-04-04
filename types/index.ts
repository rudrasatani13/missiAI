// ─── Message & Conversation ───────────────────────────────────────────────────

export type MessageRole = "user" | "assistant"

export interface Message {
  role: MessageRole
  content: string
  image?: string
}

// ─── AI / Personality ─────────────────────────────────────────────────────────

export type PersonalityKey = "bestfriend" | "professional" | "playful" | "mentor"
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

// Minimal KV interface — Cloudflare KV compatible, but not vendor-locked
export interface KVStore {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

// ─── Voice ────────────────────────────────────────────────────────────────────

export interface TTSOptions {
  text: string
  voiceId: string
  apiKey: string
  modelId?: string
  stability?: number
  similarityBoost?: number
  style?: number
  speed?: number
}

export interface STTOptions {
  audio: File | Blob
  apiKey: string
  languageCode?: string
  keyterms?: string[]
}

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
