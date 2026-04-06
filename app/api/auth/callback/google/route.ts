import { NextRequest, NextResponse } from "next/server"
import { getEnv } from "@/lib/server/env"
import { saveGoogleTokens, fetchCalendarContext } from "@/lib/plugins/data-fetcher"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

function getKV() {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch { return null }
}

// ─── Google OAuth Callback ────────────────────────────────────────────────────
// Exchanges the authorization code for tokens, fetches initial calendar data.

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

  // Decode state to get userId
  let userId: string
  try {
    const decoded = JSON.parse(atob(state))
    userId = decoded.userId
    if (!userId) throw new Error("No userId in state")
  } catch {
    chatUrl.searchParams.set("oauth_error", "invalid_state")
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

    const kv = getKV()
    if (kv) {
      await saveGoogleTokens(kv, userId, tokens)

      // Pre-fetch calendar context in background
      fetchCalendarContext(
        kv, userId,
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        true
      ).catch(() => {})
    } else {
      // Fallback: store in cookie for local dev
      const response = NextResponse.redirect(chatUrl)
      response.cookies.set(`google_tokens_${userId}`, JSON.stringify(tokens), {
        httpOnly: true,
        secure: false,
        maxAge: 60 * 60 * 24 * 90,
        path: "/"
      })
      return response
    }

    chatUrl.searchParams.set("oauth_success", "google")
    return NextResponse.redirect(chatUrl)
  } catch {
    chatUrl.searchParams.set("oauth_error", "server_error")
    return NextResponse.redirect(chatUrl)
  }
}
