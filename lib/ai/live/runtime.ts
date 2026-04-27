export const LIVE_MODEL = "gemini-live-2.5-flash-native-audio"
export const LOCAL_LIVE_DIRECT_TTL_SECONDS = 55 * 60

export interface LiveTokenSuccessResponse {
  success: true
  wsUrl: string
  modelPath: string
  expiresAt: string
}

function toUrl(input: string | URL): URL {
  return input instanceof URL ? input : new URL(input)
}

export function buildLiveModelPath(
  projectId: string,
  location: string,
  model: string = LIVE_MODEL,
): string {
  return `projects/${projectId}/locations/${location}/publishers/google/models/${model}`
}

export function isLocalLiveDevelopmentRequest(
  requestUrl: string | URL,
  nodeEnv: string | undefined,
): boolean {
  const url = toUrl(requestUrl)
  return nodeEnv !== "production" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")
}

export function buildLiveRelayWsUrl(requestUrl: string | URL): string {
  const url = toUrl(requestUrl)
  const wsScheme = url.protocol === "https:" ? "wss://" : "ws://"
  return `${wsScheme}${url.host}/api/v1/voice-relay`
}

export function buildLiveTokenSuccessResponse(opts: {
  wsUrl: string
  modelPath: string
  ttlSeconds: number
  nowMs?: number
}): LiveTokenSuccessResponse {
  const nowMs = opts.nowMs ?? Date.now()

  return {
    success: true,
    wsUrl: opts.wsUrl,
    modelPath: opts.modelPath,
    expiresAt: new Date(nowMs + opts.ttlSeconds * 1000).toISOString(),
  }
}
