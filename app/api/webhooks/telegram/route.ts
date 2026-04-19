// ─── Telegram Bot Webhook Handler ────────────────────────────────────────────
//
// Public endpoint — no Clerk auth (platform-to-server call).
// IP-based rate limiting still applies via middleware.
//
// Required environment variables:
//   TELEGRAM_BOT_TOKEN       — Telegram bot API token
//   TELEGRAM_WEBHOOK_SECRET  — Secret token set when registering the webhook

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { verifyTelegramSecret, sendTelegramMessage } from '@/lib/bot/telegram-client'
import {
  resolveClerkUserFromTelegramId,
  storeTelegramMapping,
  checkPlanGate,
  checkAndIncrementBotDailyLimit,
  isMessageDuplicate,
  markMessageProcessed,
  consumeTelegramLinkCode,
} from '@/lib/bot/bot-auth'
import { processBotMessage } from '@/lib/bot/bot-pipeline'
import { logSecurityEvent, logApiError, log } from '@/lib/server/logger'
import type { KVStore } from '@/types'
import type { VectorizeEnv } from '@/lib/memory/vectorize'

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getCloudflareContext()
    const lg = (env as any).LIFE_GRAPH
    return lg ? { LIFE_GRAPH: lg } : null
  } catch {
    return null
  }
}

function getExecutionContext(): { waitUntil: (p: Promise<unknown>) => void } | null {
  try {
    const { ctx } = getCloudflareContext() as { ctx?: { waitUntil: (p: Promise<unknown>) => void } }
    return ctx ?? null
  } catch {
    return null
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

// ─── POST — Incoming update processing ───────────────────────────────────────
//
// Security validation order (NEVER rearrange):
//   1. Verify X-Telegram-Bot-Api-Secret-Token header
//   2. Parse JSON body
//   3. Deduplicate by update_id
//   4. Handle /start {code} for account linking
//   5. Resolve Clerk userId from Telegram user ID
//   6. Check plan gate (Pro required)
//   7. Check daily message limit
//   8. Process via Gemini pipeline
//   9. Send reply via Telegram sendMessage API
//  10. Return 200 immediately

export async function POST(req: Request): Promise<Response> {
  const ok200 = new Response('ok', { status: 200 })

  // ── 1. Verify Telegram secret token ───────────────────────────────────────
  //
  // Telegram sends X-Telegram-Bot-Api-Secret-Token on every update when
  // a secret_token is configured during webhook registration.
  const tokenHeader = req.headers.get('x-telegram-bot-api-secret-token')
  const isValid = await verifyTelegramSecret(tokenHeader)

  if (!isValid) {
    logSecurityEvent('security.bot.tg.invalid_secret', {
      path: '/api/webhooks/telegram',
      metadata: { hasToken: !!tokenHeader },
    })
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 2. Parse JSON body ─────────────────────────────────────────────────────
  let update: any
  try {
    update = await req.json()
  } catch {
    return ok200
  }

  const kv = getKV()
  const vectorizeEnv = getVectorizeEnv()
  const execCtx = getExecutionContext()
  if (!kv) return ok200

  // ── 3. Deduplication by update_id ─────────────────────────────────────────
  const updateId = update?.update_id
  if (!updateId) return ok200

  const isDup = await isMessageDuplicate(kv, 'telegram', updateId)
  if (isDup) {
    log({ level: 'info', event: 'bot.tg.dedup_skipped', metadata: { updateId }, timestamp: Date.now() })
    return ok200
  }
  await markMessageProcessed(kv, 'telegram', updateId)

  // ── 4. Extract message ─────────────────────────────────────────────────────
  const message = update?.message
  if (!message) return ok200 // Callback query, inline query, etc.

  const chatId: number = message.chat?.id
  const telegramUserId: number = message.from?.id
  const messageText: string = message.text ?? ''

  if (!chatId || !telegramUserId) return ok200

  // ── 5. Handle /start {code} — Telegram account linking ────────────────────
  if (messageText.startsWith('/start ')) {
    const code = messageText.slice(7).trim()
    if (code) {
      await handleTelegramLinking(kv, code, telegramUserId, chatId)
      return ok200
    }
  }

  // Welcome message for /start without a code
  if (messageText === '/start') {
    sendTelegramMessage(
      chatId,
      'Hi! I\'m Missi 🤖 To chat with me here, link your Telegram account at missi.space/settings/integrations — takes just 30 seconds!',
    ).catch(() => {})
    return ok200
  }

  // ── 6. Resolve Clerk userId ────────────────────────────────────────────────
  const userId = await resolveClerkUserFromTelegramId(kv, telegramUserId)
  if (!userId) {
    logSecurityEvent('security.bot.tg.unknown_sender', {
      path: '/api/webhooks/telegram',
      metadata: { telegramUserId: String(telegramUserId).slice(0, 4) + '****' },
    })
    sendTelegramMessage(
      chatId,
      'Hey! To chat with me here, link your Telegram at missi.space/settings/integrations 🚀',
    ).catch(() => {})
    return ok200
  }

  // ── 7. Plan gate ───────────────────────────────────────────────────────────
  const { allowed: planAllowed, planId } = await checkPlanGate(userId)
  if (!planAllowed) {
    logSecurityEvent('security.bot.tg.plan_gate_blocked', {
      userId,
      path: '/api/webhooks/telegram',
      metadata: { planId },
    })
    sendTelegramMessage(
      chatId,
      'Telegram access is a Pro feature. Upgrade at missi.space/pricing to chat with me here! 🚀',
    ).catch(() => {})
    return ok200
  }

  // ── 8. Daily message limit ─────────────────────────────────────────────────
  const { allowed: limitAllowed } = await checkAndIncrementBotDailyLimit(
    kv, 'telegram', userId, today(),
  )
  if (!limitAllowed) {
    sendTelegramMessage(
      chatId,
      'You\'ve hit your daily message limit! Let\'s chat again tomorrow 😊',
    ).catch(() => {})
    return ok200
  }

  // ── 9. Handle non-text message types ──────────────────────────────────────
  if (!messageText.trim()) {
    sendTelegramMessage(
      chatId,
      'I can only understand text messages for now! 🙏',
    ).catch(() => {})
    return ok200
  }

  // ── 10. Process via Gemini pipeline and reply ──────────────────────────────
  // IMPORTANT: Use waitUntil() so the Cloudflare Worker stays alive during
  // async Gemini processing. Without this, the Worker is killed after
  // returning the 200 Response, before the AI reply is generated.
  const processingPromise = (async () => {
    try {
      const reply = await processBotMessage({
        kv,
        vectorizeEnv,
        userId,
        messageText,
        platform: 'telegram',
      })
      await sendTelegramMessage(chatId, reply)
      log({ level: 'info', event: 'bot.tg.message_processed', userId, timestamp: Date.now() })
    } catch (err) {
      logApiError('bot.tg.processing_error', err, { userId, httpStatus: 500, path: '/api/webhooks/telegram' })
      sendTelegramMessage(chatId, 'Oops, something went wrong! Please try again in a bit 🙏').catch(() => {})
    }
  })()

  if (execCtx) {
    execCtx.waitUntil(processingPromise)
  } else {
    await processingPromise
  }

  return ok200
}

// ─── Telegram account linking via /start {code} ───────────────────────────────

async function handleTelegramLinking(
  kv: KVStore,
  code: string,
  telegramUserId: number,
  chatId: number,
): Promise<void> {
  try {
    const result = await consumeTelegramLinkCode(kv, code)
    if (!result) {
      await sendTelegramMessage(
        chatId,
        'This link has expired or is invalid. Please generate a new one from missi.space/settings/integrations',
      )
      return
    }

    const { clerkUserId } = result
    await storeTelegramMapping(kv, telegramUserId, clerkUserId)

    log({
      level: 'info',
      event: 'bot.tg.account_linked',
      userId: clerkUserId,
      timestamp: Date.now(),
    })

    await sendTelegramMessage(
      chatId,
      'Connected to your Missi account! 🎉 You can now chat with me directly here. What do you need?',
    )
  } catch (err) {
    logApiError('bot.tg.linking_error', err, { httpStatus: 500, path: '/api/webhooks/telegram' })
    await sendTelegramMessage(chatId, 'Linking failed — please try again from missi.space').catch(() => {})
  }
}
