// ─── WhatsApp Cloud API Webhook Handler ───────────────────────────────────────
//
// Public endpoint — no Clerk auth (platform-to-server call).
// IP-based rate limiting still applies via middleware.
//
// Required environment variables:
//   WHATSAPP_PHONE_NUMBER_ID  — Meta Cloud API phone number ID
//   WHATSAPP_ACCESS_TOKEN     — Meta permanent access token
//   WHATSAPP_APP_SECRET       — HMAC-SHA256 signature key
//   WHATSAPP_VERIFY_TOKEN     — Webhook GET verification token

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { verifyWhatsAppSignature, sendWhatsAppMessage } from '@/lib/bot/whatsapp-client'
import {
  resolveClerkUserFromPhone,
  storeWhatsAppMapping,
  checkPlanGate,
  checkAndIncrementBotDailyLimit,
  isMessageDuplicate,
  markMessageProcessed,
  consumePendingWhatsAppLink,
  checkAndIncrementWaLinkAttempt,
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

// ─── GET — Meta webhook verification challenge ────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const challenge = url.searchParams.get('hub.challenge')
  const verifyToken = url.searchParams.get('hub.verify_token')

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN
  if (!expectedToken) {
    log({ level: 'error', event: 'bot.wa.webhook_verify.missing_env', timestamp: Date.now() })
    return new Response('Internal error', { status: 500 })
  }

  if (mode !== 'subscribe' || verifyToken !== expectedToken) {
    logSecurityEvent('security.bot.wa.verify_token_mismatch', {
      path: '/api/webhooks/whatsapp',
      metadata: { mode, hasToken: !!verifyToken },
    })
    return new Response('Forbidden', { status: 403 })
  }

  // Return the challenge to confirm subscription
  return new Response(challenge ?? '', { status: 200 })
}

// ─── POST — Incoming message processing ──────────────────────────────────────
//
// Security validation order (NEVER rearrange):
//   1. Read raw body
//   2. Verify X-Hub-Signature-256 (HMAC-SHA256) — reject 401 on failure
//   3. Parse JSON
//   4. Validate timestamp — reject replays older than 5 min
//   5. Deduplicate by message ID
//   6. Resolve Clerk userId from sender phone
//   7. Check plan gate (Pro required)
//   8. Check daily message limit
//   9. Process via Gemini pipeline
//  10. Send reply via WhatsApp API
//  11. Return 200 immediately to Meta (Meta retries on non-200)

export async function POST(req: Request): Promise<Response> {
  const ok200 = new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  // ── 1. Read raw body ───────────────────────────────────────────────────────
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return ok200 // Always 200 to Meta
  }

  // ── 2. Signature validation — MUST happen before any other processing ──────
  const sigHeader = req.headers.get('x-hub-signature-256')
  const isValid = await verifyWhatsAppSignature(rawBody, sigHeader)

  if (!isValid) {
    logSecurityEvent('security.bot.wa.invalid_signature', {
      path: '/api/webhooks/whatsapp',
      metadata: { hasSignature: !!sigHeader },
    })
    return new Response(JSON.stringify({ received: false, error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── 3. Parse JSON ──────────────────────────────────────────────────────────
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return ok200
  }

  const kv = getKV()
  const vectorizeEnv = getVectorizeEnv()
  const execCtx = getExecutionContext()

  // ── 4. Extract message entry ───────────────────────────────────────────────
  const entry = payload?.entry?.[0]
  const changes = entry?.changes?.[0]
  const value = changes?.value

  if (!value) return ok200 // Not a message update — status update etc.

  const messages: any[] = value.messages ?? []
  if (messages.length === 0) return ok200 // Delivery receipt or read status

  // Process each inbound message concurrently
  await Promise.all(messages.map(async (message) => {
    try {
      // ── 5. Replay attack protection — validate timestamp ───────────────────
      const tsSeconds = parseInt(message.timestamp, 10)
      const nowSeconds = Math.floor(Date.now() / 1000)
      const ageSec = nowSeconds - tsSeconds
      if (!Number.isNaN(tsSeconds) && Math.abs(ageSec) > 300) {
        logSecurityEvent('security.bot.wa.replay_attempt', {
          path: '/api/webhooks/whatsapp',
          metadata: { messageId: message.id, ageSec },
        })
        return
      }

      const messageId: string = message.id
      const senderPhone: string = message.from

      // ── 6. Deduplication ──────────────────────────────────────────────────
      if (!kv) {
        log({ level: 'error', event: 'bot.wa.kv_unavailable', metadata: { messageId }, timestamp: Date.now() })
        return
      }
      const isDup = await isMessageDuplicate(kv, 'whatsapp', messageId)
      if (isDup) {
        log({ level: 'info', event: 'bot.wa.dedup_skipped', metadata: { messageId }, timestamp: Date.now() })
        return
      }
      await markMessageProcessed(kv, 'whatsapp', messageId)

      // ── 7. Resolve Clerk userId from sender phone ──────────────────────────
      const userId = await resolveClerkUserFromPhone(kv, senderPhone)
      if (!userId) {
        // Check if this is an account-linking code (exactly 6 digits).
        // Rate-limit code guesses per sender phone to prevent brute-forcing
        // the 1M-combination space within the 15-minute code TTL.
        const msgText = (message.text?.body ?? '').trim()
        if (/^\d{6}$/.test(msgText)) {
          const linkRateResult = await checkAndIncrementWaLinkAttempt(kv, senderPhone, today())
          if (!linkRateResult.allowed) {
            logSecurityEvent('security.bot.wa.link_attempts_exceeded', {
              path: '/api/webhooks/whatsapp',
              metadata: { senderPhone: senderPhone.slice(0, 4) + '****', attempts: linkRateResult.attempts },
            })
            // Silent return — don't reveal rate-limit details to attacker
            return
          }
          const pendingUserId = await consumePendingWhatsAppLink(kv, msgText)
          if (pendingUserId) {
            await storeWhatsAppMapping(kv, senderPhone, pendingUserId)
            sendWhatsAppMessage(
              senderPhone,
              'WhatsApp linked to your Missi account! 🎉 You can now chat with me directly here. What do you need?',
            ).catch(() => {})
            log({ level: 'info', event: 'bot.wa.linked_via_code', userId: pendingUserId, timestamp: Date.now() })
            return
          }
        }
        logSecurityEvent('security.bot.wa.unknown_sender', {
          path: '/api/webhooks/whatsapp',
          metadata: { senderPhone: senderPhone.slice(0, 4) + '****' },
        })
        sendWhatsAppMessage(
          senderPhone,
          'Hey! I\'m Missi 🤖 To chat with me here, link your WhatsApp number at missi.space/settings/integrations — takes just 1 minute!',
        ).catch(() => {})
        return
      }

      // ── 8. Plan gate ───────────────────────────────────────────────────────
      const { allowed: planAllowed, planId } = await checkPlanGate(userId)
      if (!planAllowed) {
        log({
          level: 'info',
          event: 'bot.wa.plan_blocked',
          userId,
          metadata: { planId },
          timestamp: Date.now(),
        })
        logSecurityEvent('security.bot.wa.plan_gate_blocked', {
          userId,
          path: '/api/webhooks/whatsapp',
          metadata: { planId },
        })
        sendWhatsAppMessage(
          senderPhone,
          'WhatsApp access is a Pro feature. Upgrade at missi.space/pricing to keep chatting with me here! 🚀',
        ).catch(() => {})
        return
      }

      // ── 9. Daily message limit ─────────────────────────────────────────────
      const { allowed: limitAllowed } = await checkAndIncrementBotDailyLimit(
        kv, 'whatsapp', userId, today(),
      )
      if (!limitAllowed) {
        sendWhatsAppMessage(
          senderPhone,
          'You\'ve hit your daily message limit! Let\'s chat again tomorrow 😊',
        ).catch(() => {})
        return
      }

      // ── 10. Handle non-text message types ─────────────────────────────────
      if (message.type !== 'text') {
        sendWhatsAppMessage(
          senderPhone,
          'I can only understand text messages for now! 🙏',
        ).catch(() => {})
        return
      }

      const userText: string = message.text?.body ?? ''
      if (!userText.trim()) return

      // ── 11. Process via Gemini pipeline and send reply ─────────────────────
      // IMPORTANT: Use waitUntil() so the Cloudflare Worker stays alive during
      // async Gemini processing. Without this, the Worker is killed after
      // returning the 200 Response, before the AI reply is generated.
      const processingPromise = (async () => {
        try {
          const reply = await processBotMessage({
            kv,
            vectorizeEnv,
            userId,
            messageText: userText,
            platform: 'whatsapp',
          })
          await sendWhatsAppMessage(senderPhone, reply)
          log({
            level: 'info',
            event: 'bot.wa.message_processed',
            userId,
            timestamp: Date.now(),
          })
        } catch (err) {
          logApiError('bot.wa.processing_error', err, { userId, httpStatus: 500, path: '/api/webhooks/whatsapp' })
          sendWhatsAppMessage(
            senderPhone,
            'Oops, something went wrong! Please try again in a bit 🙏',
          ).catch(() => {})
        }
      })()

      if (execCtx) {
        execCtx.waitUntil(processingPromise)
      } else {
        await processingPromise
      }
    } catch (loopErr) {
      logApiError('bot.wa.loop_error', loopErr, { httpStatus: 500, path: '/api/webhooks/whatsapp' })
    }
  }))

  return ok200
}
