import { buildLiveModelPath } from "./runtime"
import { getVertexAccessToken, getVertexLocation, getVertexProjectId, isVertexAI } from "../providers/vertex-auth"

export interface VertexLiveRuntimeConfig {
  location: string
  modelPath: string
}

export type VertexLiveRelayRequestResult =
  | {
      ok: true
      upstreamUrl: string
      headers: {
        Upgrade: "websocket"
        Authorization: string
      }
    }
  | {
      ok: false
      reason: "not_configured" | "auth_failed"
    }

export function buildVertexLiveDirectWsUrl(location: string, accessToken: string): string {
  return `wss://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1.LlmBidiService/BidiGenerateContent?access_token=${accessToken}`
}

export function buildVertexLiveRelayUpstreamUrl(location: string): string {
  return `https://${location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`
}

export function getVertexLiveRuntimeConfig(model: string): VertexLiveRuntimeConfig | null {
  if (!isVertexAI()) return null

  const location = getVertexLocation()
  return {
    location,
    modelPath: buildLiveModelPath(getVertexProjectId(), location, model),
  }
}

export async function getVertexLiveDirectWsUrl(): Promise<string> {
  if (!isVertexAI()) {
    throw new Error("Only Vertex AI backend is supported for Live API")
  }

  const token = await getVertexAccessToken()
  if (!token) throw new Error("Failed to obtain Vertex AI access token for Live API")

  return buildVertexLiveDirectWsUrl(getVertexLocation(), token)
}

export async function getVertexLiveRelayRequest(): Promise<VertexLiveRelayRequestResult> {
  if (!isVertexAI()) {
    return { ok: false, reason: "not_configured" }
  }

  const token = await getVertexAccessToken()
  if (!token) {
    return { ok: false, reason: "auth_failed" }
  }

  return {
    ok: true,
    upstreamUrl: buildVertexLiveRelayUpstreamUrl(getVertexLocation()),
    headers: {
      Upgrade: "websocket",
      Authorization: `Bearer ${token}`,
    },
  }
}
