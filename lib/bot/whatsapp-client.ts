// ─── WhatsApp Cloud API Client ────────────────────────────────────────────────
//
// Direct HTTP calls to Meta WhatsApp Cloud API v21.0.
// No third-party BSP or wrapper library.
//
// Required environment variables (set via wrangler secret put or Pages dashboard):
//   WHATSAPP_PHONE_NUMBER_ID  — Meta Cloud API phone number ID
//   WHATSAPP_ACCESS_TOKEN     — Meta permanent access token
//   WHATSAPP_APP_SECRET       — HMAC-SHA256 signature validation key
//   WHATSAPP_VERIFY_TOKEN     — Webhook GET verification token

import { hmacSha256Hex, timingSafeCompare } from '@/lib/bot/bot-crypto'

const WA_API_VERSION = 'v21.0'
const WA_API_BASE = `https://graph.facebook.com/${WA_API_VERSION}`

// ─── Send a text message via WhatsApp Cloud API ───────────────────────────────

export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN

  if (!phoneNumberId || !accessToken) {
    throw new Error('Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const res = await fetch(`${WA_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      throw new Error(`WhatsApp API error ${res.status}: ${errBody}`)
    }
  } finally {
    clearTimeout(timer)
  }
}

// ─── Send an OTP to a WhatsApp number ────────────────────────────────────────

export async function sendWhatsAppOTP(phone: string, otp: string): Promise<void> {
  const text = `Your missiAI verification code is: *${otp}*\n\nThis code expires in 10 minutes. Do not share it with anyone.`
  await sendWhatsAppMessage(phone, text)
}

// ─── Verify incoming webhook signature ───────────────────────────────────────
//
// Meta sends X-Hub-Signature-256: sha256=<hex-digest>
// Computed as HMAC-SHA256(WHATSAPP_APP_SECRET, rawBody).
// Use timingSafeCompare to prevent timing oracle attacks.
export async function verifyWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  try {
    const appSecret = process.env.WHATSAPP_APP_SECRET
    if (!appSecret || !signatureHeader) return false

    if (!signatureHeader.startsWith('sha256=')) return false
    const providedHex = signatureHeader.slice(7)

    const encoder = new TextEncoder()
    const keyBytes = encoder.encode(appSecret)
    const computedHex = await hmacSha256Hex(keyBytes, rawBody)

    return timingSafeCompare(computedHex, providedHex)
  } catch {
    return false
  }
}
