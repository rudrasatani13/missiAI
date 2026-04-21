import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { randomHex } from "@/lib/bot/bot-crypto"
import type { KVStore } from "@/types"


// ─── Google OAuth Connect ─────────────────────────────────────────────────────
// Redirects the user to Google's OAuth consent screen.
// Rate limiting is handled by the middleware's IP-based limiter (100 req/min).

// OAuth state token TTL — 10 minutes max for the user to complete consent
const STATE_TTL_SECONDS = 600

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

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

  if (!env.GOOGLE_CLIENT_ID) {
    console.warn("[oauth.google] Integration not configured")
    return NextResponse.json(
      { error: "Integration temporarily unavailable" },
      { status: 503 }
    )
  }

  const redirectUri = `${env.APP_URL}/api/auth/callback/google`

  // SECURITY: Generate a cryptographically random state token and store
  // the userId mapping in KV. This prevents CSRF attacks where an attacker
  // forges a state parameter to bind their OAuth tokens to a victim's account.
  const stateToken = randomHex(32)
  const kv = getKV()
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
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ].join(" "),
    access_type: "offline",
    prompt: "consent",
    state: stateToken,
  })

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
}
