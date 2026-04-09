/**
 * Unified Gemini API Client — Dual Backend Support
 *
 * Abstracts the difference between Google AI Studio (API key) and
 * Vertex AI (OAuth2 access token) so callers don't need to know
 * which backend is configured.
 *
 * Usage:
 *   const res = await geminiGenerate(model, requestBody)
 *   const res = await geminiGenerateStream(model, requestBody)
 *   const res = await geminiEmbed(text)
 */

import {
  getVertexAccessToken,
  getVertexProjectId,
  getVertexLocation,
  isVertexAI,
} from "./vertex-auth"

// ─── Model Availability ─────────────────────────────────────────────────────────

/**
 * Models that are NOT yet available on Vertex AI and must always use
 * Google AI Studio regardless of the AI_BACKEND setting.
 * Update this list as Google rolls out models to Vertex AI.
 */
const GOOGLE_AI_ONLY_MODELS = new Set([
  "gemini-3-flash-preview",
  "gemini-3.1-flash-preview",
  "gemini-3.1-flash-lite-preview",
  "gemini-3.1-flash-live-preview",
])

/**
 * Map of model names to their Vertex AI equivalents.
 * If a model is not in this map, it's used as-is.
 */
const VERTEX_MODEL_MAP: Record<string, string> = {
  // Preview → stable equivalents on Vertex AI
  // Add mappings here as needed
}

/**
 * Check if a specific model should use Google AI Studio
 * (because it's not available on Vertex AI yet).
 */
function shouldUseGoogleAI(model: string): boolean {
  return GOOGLE_AI_ONLY_MODELS.has(model)
}

/** Resolve model name for the chosen backend. */
function resolveVertexModel(model: string): string {
  return VERTEX_MODEL_MAP[model] || model
}

// ─── URL Builders ───────────────────────────────────────────────────────────────

/**
 * Build the REST API URL for a Gemini model endpoint.
 * @param model - Model name (e.g. "gemini-3-flash-preview")
 * @param method - API method (e.g. "generateContent", "streamGenerateContent", "embedContent")
 * @param queryParams - Optional query parameters (e.g. "alt=sse")
 */
function buildGoogleAIUrl(model: string, method: string, queryParams?: string): string {
  const base = `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`
  return queryParams ? `${base}?${queryParams}` : base
}

function buildVertexAIUrl(model: string, method: string, queryParams?: string): string {
  const project = getVertexProjectId()
  const location = getVertexLocation()
  const base = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${method}`
  return queryParams ? `${base}?${queryParams}` : base
}

// ─── Auth Headers ───────────────────────────────────────────────────────────────

/**
 * Get the appropriate auth headers for the configured backend.
 * If forceGoogleAI is true, always use the API key (for models not on Vertex).
 */
async function getAuthHeaders(forceGoogleAI: boolean = false): Promise<Record<string, string>> {
  if (isVertexAI() && !forceGoogleAI) {
    const token = await getVertexAccessToken()
    if (!token) throw new Error("Failed to obtain Vertex AI access token")
    return { Authorization: `Bearer ${token}` }
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")
  return { "x-goog-api-key": apiKey }
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Make a Gemini generateContent request (non-streaming).
 * Works with both Google AI Studio and Vertex AI.
 */
export async function geminiGenerate(
  model: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<Response> {
  // Some preview models aren't on Vertex AI yet — fall back to Google AI Studio
  const forceGoogleAI = shouldUseGoogleAI(model)
  const useVertex = isVertexAI() && !forceGoogleAI
  const resolvedModel = useVertex ? resolveVertexModel(model) : model
  const url = useVertex
    ? buildVertexAIUrl(resolvedModel, "generateContent")
    : buildGoogleAIUrl(resolvedModel, "generateContent")

  const authHeaders = await getAuthHeaders(forceGoogleAI)

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
}

/**
 * Make a Gemini streamGenerateContent request (SSE streaming).
 * Works with both Google AI Studio and Vertex AI.
 */
export async function geminiGenerateStream(
  model: string,
  body: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<Response> {
  const forceGoogleAI = shouldUseGoogleAI(model)
  const useVertex = isVertexAI() && !forceGoogleAI
  const resolvedModel = useVertex ? resolveVertexModel(model) : model
  const url = useVertex
    ? buildVertexAIUrl(resolvedModel, "streamGenerateContent", "alt=sse")
    : buildGoogleAIUrl(resolvedModel, "streamGenerateContent", "alt=sse")

  const authHeaders = await getAuthHeaders(forceGoogleAI)

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
}

/**
 * Generate embeddings via Gemini text-embedding-004.
 * Works with both Google AI Studio and Vertex AI.
 */
export async function geminiEmbed(
  text: string,
  options?: { signal?: AbortSignal }
): Promise<Response> {
  const embeddingModel = "text-embedding-004"
  const useVertex = isVertexAI()
  const url = useVertex
    ? buildVertexAIUrl(embeddingModel, "embedContent")
    : buildGoogleAIUrl(embeddingModel, "embedContent")

  const authHeaders = await getAuthHeaders()

  // Vertex AI uses different body format for model reference
  const body = useVertex
    ? { content: { parts: [{ text }] } }
    : { model: `models/${embeddingModel}`, content: { parts: [{ text }] } }

  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify(body),
    signal: options?.signal,
  })
}

/**
 * Get the WebSocket URL for Gemini Live API.
 * For Google AI Studio: includes API key as query param.
 * For Vertex AI: includes OAuth access token as query param.
 *
 * Pass forceGoogleAI=true to always use the Google AI Studio endpoint,
 * regardless of the configured backend (needed for preview-only models
 * like gemini-3.1-flash-live-preview that aren't on Vertex AI yet).
 */
export async function getGeminiLiveWsUrl(forceGoogleAI: boolean = false): Promise<string> {
  if (isVertexAI() && !forceGoogleAI) {
    const token = await getVertexAccessToken()
    if (!token) throw new Error("Failed to obtain Vertex AI access token for Live API")
    const location = getVertexLocation()
    return `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=${token}`
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured")
  return `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`
}
