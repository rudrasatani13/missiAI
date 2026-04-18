// ─── Bot Webhook Cryptographic Utilities ─────────────────────────────────────
//
// Edge-runtime compatible HMAC helpers for WhatsApp and Telegram webhook
// signature verification. No Node.js crypto — uses Web Crypto API only.

// ─── Constant-time string comparison ─────────────────────────────────────────
//
// Prevents timing-oracle attacks on HMAC comparisons.
// Same pattern as lib/billing/dodo-client.ts (not exported from there).
export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const aBytes = encoder.encode(a)
    const bBytes = encoder.encode(b)

    if (aBytes.byteLength !== bBytes.byteLength) {
      return false
    }

    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )

    const aSig = await crypto.subtle.sign('HMAC', key, aBytes)
    return crypto.subtle.verify('HMAC', key, aSig, bBytes)
  } catch {
    return false
  }
}

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
export function generateOTP(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(buf[0] % 1_000_000).padStart(6, '0')
}
