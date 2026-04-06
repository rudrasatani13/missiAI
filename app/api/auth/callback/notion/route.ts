import { NextRequest, NextResponse } from "next/server"
import { getEnv } from "@/lib/server/env"
import { saveNotionTokens, fetchNotionContext } from "@/lib/plugins/data-fetcher"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

function getKV() {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch { return null }
}

// ─── Notion OAuth Callback ────────────────────────────────────────────────────
// Exchanges authorization code for Notion access token.

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

    const kv = getKV()
    if (kv) {
      await saveNotionTokens(kv, userId, tokens)

      // Pre-fetch notion context in background
      fetchNotionContext(kv, userId, true).catch(() => {})
    } else {
      // Fallback: cookie for local dev
      const response = NextResponse.redirect(chatUrl)
      response.cookies.set(`notion_tokens_${userId}`, JSON.stringify(tokens), {
        httpOnly: true,
        secure: false,
        maxAge: 60 * 60 * 24 * 90,
        path: "/"
      })
      return response
    }

    chatUrl.searchParams.set("oauth_success", "notion")
    return NextResponse.redirect(chatUrl)
  } catch {
    chatUrl.searchParams.set("oauth_error", "server_error")
    return NextResponse.redirect(chatUrl)
  }
}
