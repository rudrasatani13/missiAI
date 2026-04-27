import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/security/auth"
import { getEnv } from "@/lib/server/platform/env"
import { saveNotionTokens, fetchNotionContext } from "@/lib/plugins/data-fetcher"
import { getCloudflareKVBinding } from "@/lib/server/platform/bindings"
import { logError } from "@/lib/server/observability/logger"

interface OAuthStateData {
  userId: string
  createdAt: number
}

interface NotionTokenResponse {
  access_token: string
  workspace_name?: string
  bot_id?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOAuthStateData(value: unknown): value is OAuthStateData {
  return isRecord(value)
    && typeof value.userId === "string"
    && typeof value.createdAt === "number"
    && Number.isFinite(value.createdAt)
}

function isNotionTokenResponse(value: unknown): value is NotionTokenResponse {
  return isRecord(value)
    && typeof value.access_token === "string"
    && (value.workspace_name === undefined || typeof value.workspace_name === "string")
    && (value.bot_id === undefined || typeof value.bot_id === "string")
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
  const kv = getCloudflareKVBinding()
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

      const stateData: unknown = JSON.parse(raw)
      if (!isOAuthStateData(stateData)) {
        throw new Error("Invalid Notion OAuth state payload")
      }

      userId = stateData.userId

      // Delete the state token immediately to prevent replay attacks
      await kv.delete(stateKey)

      // Verify the authenticated user matches the one who initiated the flow
      if (userId !== currentUserId) {
        logError("oauth.notion.user_mismatch", "Authenticated user does not match state userId", currentUserId)
        chatUrl.searchParams.set("oauth_error", "invalid_state")
        return NextResponse.redirect(chatUrl)
      }
    } catch (error) {
      logError("oauth.notion.invalid_state", error, currentUserId)
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
      logError("oauth.notion.token_exchange_error", `HTTP ${tokenRes.status}`, userId)
      chatUrl.searchParams.set("oauth_error", "token_exchange_failed")
      return NextResponse.redirect(chatUrl)
    }

    const tokenData: unknown = await tokenRes.json()
    if (!isNotionTokenResponse(tokenData)) {
      throw new Error("Invalid Notion token response")
    }

    const tokens = {
      accessToken: tokenData.access_token,
      workspaceName: tokenData.workspace_name ?? "Notion",
      botId: tokenData.bot_id ?? "",
    }

    // KV is guaranteed available here (verified above)
    await saveNotionTokens(kv!, userId, tokens)

    // Pre-fetch notion context in background
    fetchNotionContext(kv!, userId, true).catch((error) => {
      logError("oauth.notion.prefetch_error", error, userId)
    })

    chatUrl.searchParams.set("oauth_success", "notion")
    return NextResponse.redirect(chatUrl)
  } catch (error) {
    logError("oauth.notion.callback_error", error, userId)
    chatUrl.searchParams.set("oauth_error", "server_error")
    return NextResponse.redirect(chatUrl)
  }
}
