import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { getEnv } from "@/lib/server/env"
import { saveNotionTokens, fetchNotionContext } from "@/lib/plugins/data-fetcher"
import { getRequestContext } from "@cloudflare/next-on-pages"
import { logError } from "@/lib/server/logger"
import type { KVStore } from "@/types"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch { return null }
}

// ─── Notion OAuth Callback ────────────────────────────────────────────────────
// Exchanges authorization code for Notion access token.
//
// SECURITY (C1, H4): Verifies state token against KV and confirms the
// authenticated Clerk session matches the userId that initiated the flow.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const chatUrl = new URL("/chat", req.url)

  if (error || !code || !state) {
    chatUrl.searchParams.set("oauth_error", "notion_denied")
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
        logError("oauth.notion.invalid_state", "State token not found or expired", currentUserId)
        chatUrl.searchParams.set("oauth_error", "invalid_state")
        return NextResponse.redirect(chatUrl)
      }

      const stateData = JSON.parse(raw) as { userId: string; createdAt: number }
      userId = stateData.userId

      // Delete the state token immediately to prevent replay attacks
      await kv.delete(stateKey)

      // Verify the authenticated user matches the one who initiated the flow
      if (userId !== currentUserId) {
        logError("oauth.notion.user_mismatch", "Authenticated user does not match state userId", currentUserId)
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

  if (!env.NOTION_CLIENT_ID || !env.NOTION_CLIENT_SECRET) {
    chatUrl.searchParams.set("oauth_error", "not_configured")
    return NextResponse.redirect(chatUrl)
  }

  const redirectUri = `${env.APP_URL}/api/auth/callback/notion`

  try {
    // Exchange code for access token
    const credentials = btoa(`${env.NOTION_CLIENT_ID}:${env.NOTION_CLIENT_SECRET}`)

    const tokenRes = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${credentials}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenRes.ok) {
      chatUrl.searchParams.set("oauth_error", "token_exchange_failed")
      return NextResponse.redirect(chatUrl)
    }

    const tokenData = await tokenRes.json() as any

    const tokens = {
      accessToken: tokenData.access_token,
      workspaceName: tokenData.workspace_name ?? "Notion",
      botId: tokenData.bot_id ?? "",
    }

    // KV is guaranteed available here (verified above)
    await saveNotionTokens(kv!, userId, tokens)

    // Pre-fetch notion context in background
    fetchNotionContext(kv!, userId, true).catch(() => {})

    chatUrl.searchParams.set("oauth_success", "notion")
    return NextResponse.redirect(chatUrl)
  } catch {
    chatUrl.searchParams.set("oauth_error", "server_error")
    return NextResponse.redirect(chatUrl)
  }
}
