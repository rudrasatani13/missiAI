// ─── Telegram Account Linking — Deep-Link Code Generation ────────────────────
//
// POST — authenticated; generates a cryptographically random 32-byte (64 hex)
// code stored in KV with 15-minute TTL. Returns the Telegram bot deep-link URL.
//
// The user opens the link → Telegram sends /start {code} to the bot webhook →
// the webhook resolves the code to a Clerk userId and stores the mapping.

import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { storeTelegramLinkCode, getLinkedTelegram } from '@/lib/bot/bot-auth'
import { randomHex } from '@/lib/bot/bot-crypto'
import { logApiError, log } from '@/lib/server/observability/logger'

function getTelegramBotUsername(): string {
  // Derive bot username from token: "123456:ABC…" → fetch getMe, but that's an
  // extra API call. Use TELEGRAM_BOT_USERNAME env var for the link.
  return process.env.TELEGRAM_BOT_USERNAME ?? 'missi_ai_bot'
}

// ─── GET — return current link status ────────────────────────────────────────

export async function GET(): Promise<Response> {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getCloudflareKVBinding()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const linkedTelegramId = await getLinkedTelegram(kv, userId)
  return new Response(
    JSON.stringify({ success: true, data: { linked: !!linkedTelegramId } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

// ─── POST — generate deep-link code ──────────────────────────────────────────

export async function POST(): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getCloudflareKVBinding()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    // Generate 32-byte (64 hex char) cryptographically random code
    const code = randomHex(32)
    await storeTelegramLinkCode(kv, code, userId)

    const botUsername = getTelegramBotUsername()
    const deepLink = `https://t.me/${botUsername}?start=${code}`

    log({ level: 'info', event: 'bot.tg.deeplink_generated', userId, timestamp: Date.now() })

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          deepLink,
          expiresInSeconds: 15 * 60,
          message: 'Open this link in Telegram within 15 minutes to link your account.',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    logApiError('bot.tg.deeplink_error', err, { userId, httpStatus: 500, path: '/api/v1/bot/link/telegram' })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to generate link', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
