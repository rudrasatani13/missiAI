// ─── Bot Webhook Cryptographic Utilities ─────────────────────────────────────
//
// Edge-runtime compatible HMAC helpers for WhatsApp and Telegram webhook
// signature verification. No Node.js crypto — uses Web Crypto API only.

// ─── Constant-time string comparison ─────────────────────────────────────────
//
// P3-1: consolidated into lib/server/security/crypto-utils.ts.
// Re-exported here for backward compatibility with existing importers.
export { timingSafeCompare } from '@/lib/server/security/crypto-utils'


// ─── Encoding helpers ─────────────────────────────────────────────────────────

export function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── HMAC-SHA256 (raw key bytes → hex digest) ─────────────────────────────────
//
// Used for WhatsApp: key is raw bytes of WHATSAPP_APP_SECRET (UTF-8).
export async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const encoder = new TextEncoder()
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
  return uint8ArrayToHex(new Uint8Array(sig))
}

// ─── Cryptographically-random hex string ─────────────────────────────────────
//
// For Telegram deep-link codes (≥32 bytes = 64 hex chars) and OTP generation.
export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return uint8ArrayToHex(bytes)
}

// ─── 6-digit numeric OTP ─────────────────────────────────────────────────────
//
// Uses getRandomValues for cryptographic quality.
// P2-1 fix: rejection sampling eliminates modulo bias. Without it, values
// 0–296,967 would be ~0.02% more likely because 2^32 is not evenly divisible
// by 1,000,000. Rejection probability is ~0.023% per sample — negligible.
export function generateOTP(): string {
  const MAX_OTP = 1_000_000
  // Largest multiple of MAX_OTP within the uint32 range [0, 2^32).
  // Values at or above this threshold would cause modulo bias and are resampled.
  const REJECTION_THRESHOLD = MAX_OTP * Math.floor(0x100000000 / MAX_OTP) // 4,294,000,000

  const buf = new Uint32Array(1)
  do {
    crypto.getRandomValues(buf)
  } while (buf[0] >= REJECTION_THRESHOLD)

  return String(buf[0] % MAX_OTP).padStart(6, '0')
}
