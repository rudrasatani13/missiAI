// ─── Telegram Bot API Client ──────────────────────────────────────────────────
//
// Direct HTTP calls to the Telegram Bot API.
// No third-party wrapper library.
//
// Required environment variables (set via wrangler secret put or Pages dashboard):
//   TELEGRAM_BOT_TOKEN       — Telegram bot API token (format: 123456:ABC-DEF…)
//   TELEGRAM_WEBHOOK_SECRET  — Secret token set when registering the Telegram webhook

import { timingSafeCompare } from '@/lib/bot/bot-crypto'

const TG_API_BASE = 'https://api.telegram.org'

function getTelegramApiUrl(method: string): string {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error('Missing TELEGRAM_BOT_TOKEN')
  return `${TG_API_BASE}/bot${token}/${method}`
}

// ─── Send a text message ──────────────────────────────────────────────────────

export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(getTelegramApiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        // Disable link previews — bots should be clean and concise
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`Telegram API error ${res.status}: ${errBody}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Verify Telegram webhook secret token ────────────────────────────────────
//
// When registering the webhook, we set secret_token = TELEGRAM_WEBHOOK_SECRET.
// Telegram then sends X-Telegram-Bot-Api-Secret-Token on every update.
// Use timingSafeCompare to prevent timing oracle attacks.
export async function verifyTelegramSecret(tokenHeader: string | null): Promise<boolean> {
  try {
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!expected || !tokenHeader) return false
    return timingSafeCompare(expected, tokenHeader)
  } catch {
    return false
  }
}
