/**
 * Vertex AI API Client
 *
 * Provides a streamlined interface to Google Cloud Vertex AI
 * for generating content, streaming, and embeddings.
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

// ─── URL Builders ───────────────────────────────────────────────────────────────

function buildVertexAIUrl(model: string, method: string, queryParams?: string): string {
  const project = getVertexProjectId()
  const location = getVertexLocation()
  const base = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:${method}`
  return queryParams ? `${base}?${queryParams}` : base
}

/**
 * Build Vertex AI URL using the 'global' endpoint.
 * Preview models (e.g. gemini-3.1-pro-preview) are often only available
 * via the global endpoint, not region-specific ones.
 */
function buildVertexAIGlobalUrl(model: string, method: string, queryParams?: string): string {
  const project = getVertexProjectId()
  const base = `https://aiplatform.googleapis.com/v1/projects/${project}/locations/global/publishers/google/models/${model}:${method}`
  return queryParams ? `${base}?${queryParams}` : base
}

/**
 * Models that should use the global Vertex AI endpoint
 * because they aren't available in all regional endpoints.
 */
const GLOBAL_ENDPOINT_MODELS = new Set<string>([
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-flash-tts-preview',
  'gemini-3-flash-preview',
])

// ─── Auth Headers ───────────────────────────────────────────────────────────────

/**
 * Get the appropriate auth headers for Vertex AI frontend.
 */
async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!isVertexAI()) {
    throw new Error("Only Vertex AI backend is supported. Please ensure AI_BACKEND is set to 'vertex'.")
  }

  const token = await getVertexAccessToken()
  if (!token) throw new Error("Failed to obtain Vertex AI access token")
  return { Authorization: `Bearer ${token}` }
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
  const useGlobalEndpoint = GLOBAL_ENDPOINT_MODELS.has(model)
  const url = useGlobalEndpoint
    ? buildVertexAIGlobalUrl(model, "generateContent")
    : buildVertexAIUrl(model, "generateContent")

  const authHeaders = await getAuthHeaders()

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
  const url = buildVertexAIUrl(model, "streamGenerateContent", "alt=sse")

  const authHeaders = await getAuthHeaders()

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
  const url = buildVertexAIUrl(embeddingModel, "embedContent")

  const authHeaders = await getAuthHeaders()

  const body = { content: { parts: [{ text }] } }

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
 * Get the UPSTREAM WebSocket URL for Gemini Live API via Vertex AI.
 *
 * ⚠️  CRITICAL (C1 pre-launch audit fix): The returned URL embeds a live
 *     Google Cloud `cloud-platform`-scoped OAuth access token in its query
 *     string. This URL MUST NEVER be sent to the browser. It is only safe
 *     to use inside the Cloudflare Worker as the upstream target of the
 *     server-side relay in `workers/live-ws-handler.ts` (deployed via the
 *     custom wrangler entry in `workers/entry.ts`).
 *
 * Prefer calling `getVertexAccessToken()` + building the URL locally inside
 * the relay handler over calling this function elsewhere.
 */
export async function getGeminiLiveWsUrl(): Promise<string> {
  if (!isVertexAI()) {
    throw new Error("Only Vertex AI backend is supported for Live API")
  }

  const token = await getVertexAccessToken()
  if (!token) throw new Error("Failed to obtain Vertex AI access token for Live API")

  const location = getVertexLocation()
  return `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=${token}`
}
