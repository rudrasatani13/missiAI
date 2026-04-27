import { getVertexLiveRelayRequest } from "../../lib/ai/live/vertex"

export interface CfWebSocketLike {
  accept(): void
  send(data: string | ArrayBuffer): void
  close(code?: number, reason?: string): void
  addEventListener(
    type: "message" | "close" | "error",
    handler: (ev: { data?: string | ArrayBuffer; code?: number; reason?: string }) => void,
  ): void
}

export type LiveWsUpstreamOpenResult =
  | { ok: true; upstreamWs: CfWebSocketLike }
  | { ok: false; status: number; code: string; message: string }

export async function openLiveWsUpstream(): Promise<LiveWsUpstreamOpenResult> {
  const relayRequest = await getVertexLiveRelayRequest()
  if (!relayRequest.ok) {
    if (relayRequest.reason === "not_configured") {
      return {
        ok: false,
        status: 500,
        code: "NOT_CONFIGURED",
        message: "Vertex AI backend not configured",
      }
    }

    return {
      ok: false,
      status: 503,
      code: "UPSTREAM_AUTH_FAILED",
      message: "Unable to obtain upstream credentials",
    }
  }

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(relayRequest.upstreamUrl, {
      headers: relayRequest.headers,
    })
  } catch (err) {
    console.error("[live-ws] upstream connect failed", err instanceof Error ? err.message : String(err))
    return {
      ok: false,
      status: 502,
      code: "UPSTREAM_UNREACHABLE",
      message: "Upstream unavailable",
    }
  }

  const upstreamWs = (upstreamRes as Response & { webSocket?: CfWebSocketLike }).webSocket
  if (!upstreamWs) {
    console.error("[live-ws] upstream did not upgrade", upstreamRes.status)
    return {
      ok: false,
      status: 502,
      code: "UPSTREAM_NO_WEBSOCKET",
      message: "Upstream did not upgrade to WebSocket",
    }
  }

  upstreamWs.accept()
  return { ok: true, upstreamWs }
}
