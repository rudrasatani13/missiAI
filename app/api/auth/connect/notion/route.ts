import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/security/auth"
import { getEnv } from "@/lib/server/platform/env"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import { randomHex } from "@/lib/bot/bot-crypto"


// ─── Notion OAuth Connect ─────────────────────────────────────────────────────
// Redirects the user to Notion's OAuth consent screen.
// Rate limiting is handled by the middleware's IP-based limiter (100 req/min).

// OAuth state token TTL — 10 minutes max for the user to complete consent
const STATE_TTL_SECONDS = 600

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
    return NextResponse.json(
      { error: "Integration temporarily unavailable" },
      { status: 503 }
    )
  }

  const redirectUri = `${env.APP_URL}/api/auth/callback/notion`

  // SECURITY: Generate a cryptographically random state token and store
  // the userId mapping in KV. This prevents CSRF attacks where an attacker
  // forges a state parameter to bind their OAuth tokens to a victim's account.
  const stateToken = randomHex(32)
  const kv = getCloudflareKVBinding()
  if (kv) {
    await kv.put(
      `oauth:state:${stateToken}`,
      JSON.stringify({ userId, createdAt: Date.now() }),
      { expirationTtl: STATE_TTL_SECONDS },
    )
  } else {
    // Fail closed — if KV is not available, we cannot securely verify the callback
    return NextResponse.json(
      { error: "Service temporarily unavailable" },
      { status: 503 }
    )
  }

  const params = new URLSearchParams({
    client_id: env.NOTION_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    owner: "user",
    state: stateToken,
  })

  return NextResponse.redirect(
    `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
  )
}
