import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { logError } from "@/lib/server/logger"

export const runtime = "edge"

// ─── Notion OAuth Connect ─────────────────────────────────────────────────────
// Redirects the user to Notion's OAuth consent screen.
// Rate limiting is handled by the middleware's IP-based limiter (100 req/min).

export async function GET(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) {
      return NextResponse.redirect(new URL("/sign-in", req.url))
    }
    throw e
  }

  const env = getEnv()

  if (!env.NOTION_CLIENT_ID) {
    logError("oauth.notion.not_configured", "NOTION_CLIENT_ID missing", userId)
    return NextResponse.json(
      { error: "Integration temporarily unavailable" },
      { status: 503 }
    )
  }

  const redirectUri = `${env.APP_URL}/api/auth/callback/notion`
  const state = btoa(JSON.stringify({ userId, ts: Date.now() }))

  const params = new URLSearchParams({
    client_id: env.NOTION_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    owner: "user",
    state,
  })

  return NextResponse.redirect(
    `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
  )
}
