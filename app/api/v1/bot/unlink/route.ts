// ─── Bot Account Unlink ───────────────────────────────────────────────────────
//
// POST { platform: "whatsapp" | "telegram" }
// Deletes all KV mappings for the authenticated user on the given platform.

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { clearWhatsAppMapping, clearTelegramMapping } from '@/lib/bot/bot-auth'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { logApiError, log } from '@/lib/server/logger'
import type { KVStore } from '@/types'

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

const unlinkSchema = z.object({
  platform: z.enum(['whatsapp', 'telegram']),
})

export async function POST(req: Request): Promise<Response> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  // ── Parse & validate body ─────────────────────────────────────────────────
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON', code: 'VALIDATION_ERROR' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const parsed = unlinkSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  const kv = getKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service temporarily unavailable', code: 'SERVICE_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { platform } = parsed.data

  try {
    if (platform === 'whatsapp') {
      await clearWhatsAppMapping(kv, userId)
    } else {
      await clearTelegramMapping(kv, userId)
    }

    log({ level: 'info', event: `bot.${platform}.unlinked`, userId, timestamp: Date.now() })

    return new Response(
      JSON.stringify({ success: true, data: { message: `${platform === 'whatsapp' ? 'WhatsApp' : 'Telegram'} unlinked successfully.` } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    logApiError('bot.unlink_error', err, { userId, httpStatus: 500, path: '/api/v1/bot/unlink' })
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to unlink account', code: 'INTERNAL_ERROR' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
