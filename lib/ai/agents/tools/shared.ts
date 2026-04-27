import type { AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"
import { saveGoogleTokens } from "@/lib/plugins/data-fetcher"
import { logError } from "@/lib/server/observability/logger"

const MAX_PROVIDER_ERROR_LENGTH = 120

interface GoogleRefreshResponse {
  access_token: string
  expires_in: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isGoogleRefreshResponse(value: unknown): value is GoogleRefreshResponse {
  return isRecord(value)
    && typeof value.access_token === "string"
    && typeof value.expires_in === "number"
    && Number.isFinite(value.expires_in)
}

export const VALID_EXPENSE_CATEGORIES = [
  "food", "transport", "shopping", "entertainment", "health", "utilities", "other",
] as const

export interface GoogleTokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export function safeProviderError(message: string): string {
  return message.slice(0, MAX_PROVIDER_ERROR_LENGTH)
}

export function isToolExecutionAborted(ctx: ToolContext): boolean {
  return ctx.abortSignal?.aborted === true
}

export function makeToolAbortedResult(toolName: string): AgentStepResult {
  return {
    toolName,
    status: "error",
    summary: "Tool execution cancelled",
    output: "This action timed out before it could safely complete.",
  }
}

export function abortedToolResult(toolName: string, ctx: ToolContext): AgentStepResult | null {
  return isToolExecutionAborted(ctx) ? makeToolAbortedResult(toolName) : null
}

export async function refreshGoogleTokenIfNeeded(
  tokens: GoogleTokenSet,
  ctx: ToolContext,
): Promise<GoogleTokenSet> {
  if (!ctx.kv) return tokens
  if (Date.now() < tokens.expiresAt - 60_000) return tokens
  if (!ctx.googleClientId || !ctx.googleClientSecret) return tokens

  try {
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: ctx.googleClientId,
        client_secret: ctx.googleClientSecret,
      }),
      signal: ctx.abortSignal,
    })
    if (!refreshRes.ok) {
      logError("agents.google.refresh_error", `HTTP ${refreshRes.status}`, ctx.userId)
      return tokens
    }

    const refreshData: unknown = await refreshRes.json()
    if (!isGoogleRefreshResponse(refreshData)) {
      throw new Error("Invalid Google refresh response")
    }

    const updated = {
      ...tokens,
      accessToken: refreshData.access_token,
      expiresAt: Date.now() + refreshData.expires_in * 1000,
    }
    await saveGoogleTokens(ctx.kv, ctx.userId, updated)
    return updated
  } catch (error) {
    logError("agents.google.refresh_error", error, ctx.userId)
  }

  return tokens
}
