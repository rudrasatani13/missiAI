import { getEnv } from "@/lib/server/platform/env"
import { LIVE_TICKET_TTL_SECONDS, issueLiveTicket } from "@/lib/ai/live/ticket"
import {
  buildLiveRelayWsUrl,
  isLocalLiveDevelopmentRequest,
  LIVE_MODEL,
  LOCAL_LIVE_DIRECT_TTL_SECONDS,
} from "@/lib/ai/live/runtime"
import { getVertexLiveDirectWsUrl, getVertexLiveRuntimeConfig } from "@/lib/ai/live/vertex"

export interface LiveTransportSession {
  wsUrl: string
  modelPath: string
  ttlSeconds: number
  relayTicket?: string
}

export type LiveTransportSessionResult =
  | { ok: true; session: LiveTransportSession }
  | { ok: false; reason: "not_configured" }

export async function getLiveTransportSession(args: {
  userId: string
  requestUrl: string | URL
  nodeEnv?: string
  model?: string
}): Promise<LiveTransportSessionResult> {
  const model = args.model ?? LIVE_MODEL
  const liveRuntime = getVertexLiveRuntimeConfig(model)
  if (!liveRuntime) {
    return { ok: false, reason: "not_configured" }
  }

  if (isLocalLiveDevelopmentRequest(args.requestUrl, args.nodeEnv)) {
    return {
      ok: true,
      session: {
        wsUrl: await getVertexLiveDirectWsUrl(),
        modelPath: liveRuntime.modelPath,
        ttlSeconds: LOCAL_LIVE_DIRECT_TTL_SECONDS,
      },
    }
  }

  const ticket = await issueLiveTicket(getEnv(), {
    userId: args.userId,
    modelPath: liveRuntime.modelPath,
  })

  return {
    ok: true,
    session: {
      wsUrl: buildLiveRelayWsUrl(args.requestUrl),
      modelPath: liveRuntime.modelPath,
      ttlSeconds: LIVE_TICKET_TTL_SECONDS,
      relayTicket: ticket,
    },
  }
}
