// ─── WhatsApp Account Linking — Reverse-Flow ──────────────────────────────────
//
// GET  — returns { linked, phone }
// POST { action: "initiate" }
//   → Generates a 6-digit code shown on the website.
//     User sends the code FROM their WhatsApp to the Missi bot number.
//     The webhook receives it, resolves the pending code, and stores the mapping.
//     UI polls GET until linked: true.

import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import {
  storePendingWhatsAppLink,
  getLinkedWhatsApp,
} from '@/lib/bot/bot-auth'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logApiError, log } from '@/lib/server/observability/logger'
import { generateOTP } from '@/lib/bot/bot-crypto'

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

  const phone = await getLinkedWhatsApp(kv, userId)
  return new Response(
    JSON.stringify({ success: true, data: { linked: !!phone, phone: phone ?? null } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}

// ─── POST schema ──────────────────────────────────────────────────────────────

const initiateSchema = z.object({ action: z.literal('initiate') })

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON', code: 'VALIDATION_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const parsed = initiateSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const kv = getCloudflareKVBinding()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Generate 6-digit code and store it (15-min TTL)
  const code = generateOTP()
  try {
    await storePendingWhatsAppLink(kv, code, userId)
  } catch (err) {
    logApiError('bot.wa.link_init_error', err, { userId, httpStatus: 500, path: '/api/v1/bot/link/whatsapp' })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to generate link code. Please try again.', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const botPhone = process.env.WHATSAPP_BOT_PHONE ?? ''

  log({ level: 'info', event: 'bot.wa.link_initiated', userId, timestamp: Date.now() })
  return new Response(
    JSON.stringify({ success: true, data: { code, botPhone, expiresIn: 900 } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
