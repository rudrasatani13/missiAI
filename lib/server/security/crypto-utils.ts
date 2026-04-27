// ─── Constant-time string comparison ─────────────────────────────────────────
//
// Prevents timing-oracle attacks on HMAC comparisons.
// P3-1: Consolidated from bot-crypto.ts and dodo-client.ts into this shared
// module so all signature verification flows use a single implementation.
//
// P1-3 fix: pads both inputs to equal length before HMAC comparison so the
// length-mismatch code path takes identical time to the match path — no
// early return that leaks expected-value length via timing.

/**
 * Constant-time string comparison using HMAC-based verification.
 *
 * Used by webhook signature verification (WhatsApp, Telegram, Dodo Payments)
 * and any other security-critical string equality checks.
 *
 * @param a - First string (e.g. computed HMAC hex digest)
 * @param b - Second string (e.g. received HMAC hex digest)
 * @returns true if strings are equal, false otherwise — in constant time
 */
export async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  try {
    const encoder = new TextEncoder()
    const aBytes = encoder.encode(a)
    const bBytes = encoder.encode(b)

    // Record length equality but do NOT short-circuit — always run the
    // full HMAC comparison to prevent a timing oracle on input length.
    const lengthsMatch = aBytes.byteLength === bBytes.byteLength

    // Pad both buffers to the longer length (zero-filled) so the crypto
    // operations below take constant time regardless of original lengths.
    const maxLen = Math.max(aBytes.byteLength, bBytes.byteLength, 1)
    const aPadded = new Uint8Array(maxLen)
    const bPadded = new Uint8Array(maxLen)
    aPadded.set(aBytes)
    bPadded.set(bBytes)

    const key = await crypto.subtle.generateKey(
      { name: 'HMAC', hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )

    const aSig = await crypto.subtle.sign('HMAC', key, aPadded)
    const hmacMatch = await crypto.subtle.verify('HMAC', key, aSig, bPadded)

    // Both length AND HMAC content must match
    return lengthsMatch && hmacMatch
  } catch {
    return false
  }
}

/**
 * Extract a human-readable error message from an unknown error value.
 *
 * P3-3: Consolidated from whatsapp/route.ts and telegram/route.ts into
 * this shared module to eliminate duplication across webhook handlers.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
