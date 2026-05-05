// ─── Webhook / Route Body-Size Guard ─────────────────────────────────────────
//
// Provides a safe body reader that short-circuits on an oversized Content-Length
// header and caps streaming reads at the configured byte limit. Prevents memory
// exhaustion from arbitrarily large untrusted payloads before any parsing occurs.

const ABSOLUTE_CEILING_BYTES = 256 * 1024 // Hard ceiling: never read > 256 KB

/**
 * Reads the request body up to `maxBytes`.
 *
 * - Rejects with HTTP 413 if Content-Length is present and exceeds `maxBytes`.
 * - Otherwise stream-reads the body, returning 413 if the stream exceeds `maxBytes`.
 * - Never reads more than 256 KB regardless of the caller's `maxBytes` argument.
 * - Throws if the underlying stream errors (let callers handle with their own
 *   try/catch, preserving their existing read-failure behaviour).
 *
 * Returns `{ body: string }` on success or `{ error: Response }` on oversized payloads.
 */
export async function readBodyWithSizeGuard(
  req: Request,
  maxBytes: number,
): Promise<{ body: string } | { error: Response }> {
  const limit = Math.min(maxBytes, ABSOLUTE_CEILING_BYTES)

  // Fast rejection via Content-Length before touching the stream.
  const contentLengthHeader = req.headers.get('content-length')
  if (contentLengthHeader !== null) {
    const declared = parseInt(contentLengthHeader, 10)
    if (!Number.isNaN(declared) && declared > limit) {
      return { error: payloadTooLargeResponse() }
    }
  }

  if (!req.body) {
    return { body: '' }
  }

  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  // May throw if the underlying stream errors — let callers catch and handle.
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      totalBytes += value.byteLength
      if (totalBytes > limit) {
        reader.cancel().catch(() => {})
        return { error: payloadTooLargeResponse() }
      }
      chunks.push(value)
    }
  }

  const combined = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }

  return { body: new TextDecoder().decode(combined) }
}

function payloadTooLargeResponse(): Response {
  return new Response(
    JSON.stringify({ received: false, error: 'Payload too large' }),
    { status: 413, headers: { 'Content-Type': 'application/json' } },
  )
}
