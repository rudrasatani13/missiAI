import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { saveGoogleTokens, fetchCalendarContext } from "@/lib/plugins/data-fetcher"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { logError } from "@/lib/server/logger"
import type { KVStore } from "@/types"


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch { return null }
}

// ─── Google OAuth Callback ────────────────────────────────────────────────────
// Exchanges the authorization code for tokens, fetches initial calendar data.
//
// SECURITY (C1, H4): Verifies state token against KV and confirms the
// authenticated Clerk session matches the userId that initiated the flow.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const chatUrl = new URL("/chat", req.url)

  // User denied access
  if (error || !code || !state) {
    chatUrl.searchParams.set("oauth_error", "google_denied")
    return NextResponse.redirect(chatUrl)
  }

  // ── SECURITY: Verify the authenticated session ──────────────────────────
  let currentUserId: string
  try {
    currentUserId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) {
      chatUrl.searchParams.set("oauth_error", "unauthenticated")
      return NextResponse.redirect(chatUrl)
    }
    chatUrl.searchParams.set("oauth_error", "server_error")
    return NextResponse.redirect(chatUrl)
  }

  // ── SECURITY: Verify state token against KV ─────────────────────────────
  const kv = getKV()
  let userId: string

  if (kv) {
    const stateKey = `oauth:state:${state}`
    try {
      const raw = await kv.get(stateKey)
      if (!raw) {
        logError("oauth.google.invalid_state", "State token not found or expired", currentUserId)
        chatUrl.searchParams.set("oauth_error", "invalid_state")
        return NextResponse.redirect(chatUrl)
      }

      const stateData = JSON.parse(raw) as { userId: string; createdAt: number }
      userId = stateData.userId

      // Delete the state token immediately to prevent replay attacks
      await kv.delete(stateKey)

      // Verify the authenticated user matches the one who initiated the flow
      if (userId !== currentUserId) {
        logError("oauth.google.user_mismatch", "Authenticated user does not match state userId", currentUserId)
        chatUrl.searchParams.set("oauth_error", "invalid_state")
        return NextResponse.redirect(chatUrl)
      }
    } catch {
      chatUrl.searchParams.set("oauth_error", "invalid_state")
      return NextResponse.redirect(chatUrl)
    }
  } else {
    // Fail closed — cannot verify state without KV
    chatUrl.searchParams.set("oauth_error", "server_error")
    return NextResponse.redirect(chatUrl)
  }

  const env = getEnv()

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    chatUrl.searchParams.set("oauth_error", "not_configured")
    return NextResponse.redirect(chatUrl)
  }

  const redirectUri = `${env.APP_URL}/api/auth/callback/google`

  // Exchange code for tokens
  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenRes.ok) {
      chatUrl.searchParams.set("oauth_error", "token_exchange_failed")
      return NextResponse.redirect(chatUrl)
    }

    const tokenData = await tokenRes.json() as any

    const tokens = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token ?? "",
      expiresAt: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
    }

    // KV is guaranteed available here (verified above)
    await saveGoogleTokens(kv!, userId, tokens)

    // Pre-fetch calendar context in background
    fetchCalendarContext(
      kv!, userId,
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      true
    ).catch(() => {})

    chatUrl.searchParams.set("oauth_success", "google")
    return NextResponse.redirect(chatUrl)
  } catch {
    chatUrl.searchParams.set("oauth_error", "server_error")
    return NextResponse.redirect(chatUrl)
  }
}
