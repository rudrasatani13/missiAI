// ─── Telegram Bot Webhook Handler ────────────────────────────────────────────
//
// Public endpoint — no Clerk auth (platform-to-server call).
// IP-based rate limiting still applies via middleware.
//
// Required environment variables:
//   TELEGRAM_BOT_TOKEN       — Telegram bot API token
//   TELEGRAM_WEBHOOK_SECRET  — Secret token set when registering the webhook

import { verifyTelegramSecret, sendTelegramMessage } from '@/lib/bot/telegram-client'
import {
  resolveClerkUserFromTelegramId,
  storeTelegramMapping,
  checkPlanGate,
  checkAndIncrementBotDailyLimit,
  isMessageDuplicate,
  markMessageProcessed,
  consumeTelegramLinkCode,
  checkAndIncrementTgLinkAttempt,
} from '@/lib/bot/bot-auth'
import { processBotMessage } from '@/lib/bot/bot-pipeline'
import {
  getCloudflareExecutionContext,
  getCloudflareKVBinding,
  getCloudflareVectorizeEnv,
} from '@/lib/server/platform/bindings'
import { logSecurityEvent, logApiError, log } from '@/lib/server/observability/logger'
import { getTodayUTC } from '@/lib/server/utils/date-utils'
import { errorMessage } from '@/lib/server/security/crypto-utils'
import type { KVStore } from '@/types'
import { z } from 'zod'

const telegramMessageSchema = z.object({
  chat: z.object({ id: z.number() }).passthrough().optional(),
  from: z.object({ id: z.number() }).passthrough().optional(),
  text: z.string().optional(),
}).passthrough()

const telegramUpdateSchema = z.object({
  update_id: z.number().int().optional(),
  message: telegramMessageSchema.optional(),
}).passthrough()

// P3-2 + P3-3: today() and errorMessage() moved to shared modules.
// Imports: getTodayUTC from date-utils, errorMessage from crypto-utils.

async function sendTelegramReply(
  execCtx: { waitUntil: (p: Promise<unknown>) => void } | null,
  chatId: number,
  text: string,
  metadata: Record<string, unknown> = {},
): Promise<boolean> {
  const replyPromise = sendTelegramMessage(chatId, text).then(() => true).catch((err) => {
    log({
      level: 'error',
      event: 'bot.tg.reply_failed',
      metadata: { chatId, error: errorMessage(err), ...metadata },
      timestamp: Date.now(),
    })
    return false
  })
  if (execCtx) {
    execCtx.waitUntil(replyPromise)
  }
  return replyPromise
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
  let rawUpdate: unknown
  try {
    rawUpdate = await req.json()
  } catch {
    return ok200
  }

  const parsedUpdate = telegramUpdateSchema.safeParse(rawUpdate)
  if (!parsedUpdate.success) {
    logSecurityEvent('security.bot.tg.invalid_payload', {
      path: '/api/webhooks/telegram',
      metadata: { issue: parsedUpdate.error.issues[0]?.message ?? 'Invalid payload' },
    })
    return ok200
  }
  const update = parsedUpdate.data

  const kv = getCloudflareKVBinding()
  const vectorizeEnv = getCloudflareVectorizeEnv()
  const execCtx = getCloudflareExecutionContext()
  if (!kv) return ok200

  // ── 3. Deduplication by update_id ─────────────────────────────────────────
  const updateId = update?.update_id
  if (!updateId) return ok200

  const isDup = await isMessageDuplicate(kv, 'telegram', updateId)
  if (isDup) {
    log({ level: 'info', event: 'bot.tg.dedup_skipped', metadata: { updateId }, timestamp: Date.now() })
    return ok200
  }

  // ── 4. Extract message ─────────────────────────────────────────────────────
  const message = update?.message
  if (!message) return ok200 // Callback query, inline query, etc.

  const chatId = message.chat?.id
  const telegramUserId = message.from?.id
  const messageText: string = message.text ?? ''

  if (chatId === undefined || telegramUserId === undefined) return ok200

  // ── 5. Handle /start {code} — Telegram account linking ────────────────────
  if (messageText.startsWith('/start ')) {
    const code = messageText.slice(7).trim()
    if (code) {
      const handled = await handleTelegramLinking(kv, code, telegramUserId, chatId)
      if (handled) {
        await markMessageProcessed(kv, 'telegram', updateId)
      }
      return ok200
    }
  }

  // Welcome message for /start without a code
  if (messageText === '/start') {
    const delivered = await sendTelegramReply(
      execCtx,
      chatId,
      'Hi! I\'m Missi 🤖 To chat with me here, link your Telegram account at missi.space/settings/integrations — takes just 30 seconds!',
      { updateId, branch: 'start_without_code' },
    )
    if (delivered) await markMessageProcessed(kv, 'telegram', updateId)
    return ok200
  }

  // ── 6. Resolve Clerk userId ────────────────────────────────────────────────
  const userId = await resolveClerkUserFromTelegramId(kv, telegramUserId)
  if (!userId) {
    logSecurityEvent('security.bot.tg.unknown_sender', {
      path: '/api/webhooks/telegram',
      metadata: { telegramUserId: String(telegramUserId).slice(0, 4) + '****' },
    })
    const delivered = await sendTelegramReply(
      execCtx,
      chatId,
      'Hey! To chat with me here, link your Telegram at missi.space/settings/integrations 🚀',
      { updateId, branch: 'unknown_sender' },
    )
    if (delivered) await markMessageProcessed(kv, 'telegram', updateId)
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
    const delivered = await sendTelegramReply(
      execCtx,
      chatId,
      'Telegram access is a Pro feature. Upgrade at missi.space/pricing to chat with me here! 🚀',
      { updateId, branch: 'plan_gate' },
    )
    if (delivered) await markMessageProcessed(kv, 'telegram', updateId)
    return ok200
  }

  // ── 8. Daily message limit ─────────────────────────────────────────────────
  const { allowed: limitAllowed } = await checkAndIncrementBotDailyLimit(
    kv, 'telegram', userId, getTodayUTC(),
  )
  if (!limitAllowed) {
    const delivered = await sendTelegramReply(
      execCtx,
      chatId,
      'You\'ve hit your daily message limit! Let\'s chat again tomorrow 😊',
      { updateId, branch: 'daily_limit' },
    )
    if (delivered) await markMessageProcessed(kv, 'telegram', updateId)
    return ok200
  }

  // ── 9. Handle non-text message types ──────────────────────────────────────
  if (!messageText.trim()) {
    const delivered = await sendTelegramReply(
      execCtx,
      chatId,
      'I can only understand text messages for now! 🙏',
      { updateId, branch: 'non_text' },
    )
    if (delivered) await markMessageProcessed(kv, 'telegram', updateId)
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
      await sendTelegramMessage(chatId, reply).catch((replyErr) => {
        log({
          level: 'error',
          event: 'bot.tg.reply_failed',
          userId,
          metadata: { updateId, chatId, branch: 'main_reply', error: errorMessage(replyErr) },
          timestamp: Date.now(),
        })
        throw replyErr
      })
      await markMessageProcessed(kv, 'telegram', updateId)
      log({ level: 'info', event: 'bot.tg.message_processed', userId, metadata: { updateId }, timestamp: Date.now() })
    } catch (err) {
      logApiError('bot.tg.processing_error', err, { userId, httpStatus: 500, path: '/api/webhooks/telegram' })
      sendTelegramMessage(chatId, 'Oops, something went wrong! Please try again in a bit 🙏').catch((replyErr) => {
        log({
          level: 'error',
          event: 'bot.tg.reply_failed',
          userId,
          metadata: { updateId, chatId, branch: 'processing_error_fallback', error: errorMessage(replyErr) },
          timestamp: Date.now(),
        })
      })
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
): Promise<boolean> {
  try {
    const rateResult = await checkAndIncrementTgLinkAttempt(kv, telegramUserId, getTodayUTC())
    if (!rateResult.allowed) {
      logSecurityEvent('security.bot.tg.link_attempts_exceeded', {
        path: '/api/webhooks/telegram',
        metadata: { telegramUserId: String(telegramUserId).slice(0, 4) + '****', attempts: rateResult.attempts },
      })
      return true
    }

    const result = await consumeTelegramLinkCode(kv, code)
    if (!result) {
      await sendTelegramMessage(
        chatId,
        'This link has expired or is invalid. Please generate a new one from missi.space/settings/integrations',
      )
      return true
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
    return true
  } catch (err) {
    logApiError('bot.tg.linking_error', err, { httpStatus: 500, path: '/api/webhooks/telegram' })
    await sendTelegramMessage(chatId, 'Linking failed — please try again from missi.space').catch((replyErr) => {
      log({
        level: 'error',
        event: 'bot.tg.reply_failed',
        metadata: { chatId, branch: 'linking_error_fallback', error: errorMessage(replyErr) },
        timestamp: Date.now(),
      })
    })
    return false
  }
}
