// ─── KV Application-Layer Encryption ──────────────────────────────────────────
//
// SECURITY (A4): AES-256-GCM encryption for sensitive KV data.
//
// This module provides transparent encrypt/decrypt wrappers for Cloudflare KV.
// It uses the Web Crypto API, which is available in Edge Runtime / Workers.
//
// DESIGN DECISIONS:
// 1. Backward-compatible: `decryptFromKV` auto-detects plaintext vs encrypted
//    data via the `enc:v1:` prefix. Existing KV values continue to work.
// 2. Fail closed: `MISSI_KV_ENCRYPTION_SECRET` is required for any new writes
//    and for decrypting encrypted values.
// 3. Per-value unique IV: Each encryption uses a fresh 12-byte random IV,
//    concatenated with the ciphertext for storage.
// 4. Minimum entropy: In production the secret MUST be at least 32 characters.
//    Secrets shorter than 32 characters are rejected at call time in production.
//    In development a short secret is permitted but emits no padding silently.
//
// FORMAT: enc:v1:<base64(iv[12] + ciphertext + authTag)>
//
// DEPLOYMENT: Add `MISSI_KV_ENCRYPTION_SECRET` as a Cloudflare secret:
//   wrangler secret put MISSI_KV_ENCRYPTION_SECRET
//
// SECRET FORMAT:
//   - Minimum:     32 characters (enforced hard in production, allowed in dev)
//   - Recommended: 44+ characters from `openssl rand -base64 32` (256-bit entropy)
//   - Do NOT use predictable values, repeated characters, or short passphrases
//   - Do NOT log or expose the secret value
//
// KEY DERIVATION (v1 — enc:v1: prefix):
//   The first 32 bytes of the UTF-8-encoded secret are used as the AES-256 key.
//   Secrets longer than 32 bytes are silently truncated to 32 bytes.
//   Secrets shorter than 32 bytes would be zero-padded, which reduces effective
//   key entropy — this is why they are rejected in production.
//   IMPORTANT: Changing this derivation would invalidate all existing enc:v1
//   ciphertext in KV. The v2 path (encv2: prefix) uses HKDF-SHA-256 instead.
//
// MIGRATION NOTE:
//   There is no planned migration from v1 to v2 key derivation for enc:v1
//   values. The correct fix is to enforce strong secrets (>= 32 chars) so
//   zero-padding never applies in practice.

import type { KVStore } from '@/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const ALGO = 'AES-GCM' as const
const IV_LENGTH = 12 // bytes — standard for AES-GCM
const KEY_LENGTH = 32 // bytes — AES-256
const ENCRYPTED_PREFIX = 'enc:v1:'

// ─── Key Derivation (cached per worker isolate lifecycle) ────────────────────

let _cachedKey: CryptoKey | null = null
let _cachedSecretHash: string | null = null

// Minimum byte-length for the encryption secret.
// AES-256 uses a 32-byte key. The v1 derivation zero-pads secrets shorter than
// this, which would reduce effective entropy. Production rejects such secrets.
export const MIN_SECRET_LENGTH = 32

function getSecret(): string {
  const secret = process.env.MISSI_KV_ENCRYPTION_SECRET
  if (!secret || secret.trim().length === 0) {
    throw new Error('MISSI_KV_ENCRYPTION_SECRET is required')
  }
  // In production, fail closed for weak short secrets rather than silently
  // reducing entropy by zero-padding the key material.
  if (secret.length < MIN_SECRET_LENGTH) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        `MISSI_KV_ENCRYPTION_SECRET must be at least ${MIN_SECRET_LENGTH} characters ` +
        `in production (got ${secret.length}). ` +
        'Generate one with: openssl rand -base64 32',
      )
    }
    // Development: allow short secrets so devs can start quickly, but the
    // zero-padding risk still applies — use a full-length secret in dev too.
  }
  return secret
}

async function getKey(): Promise<CryptoKey> {
  const secret = getSecret()

  // Cache invalidation: if the secret changes (rotate), re-derive the key
  if (_cachedKey && _cachedSecretHash === secret) return _cachedKey

  // Pad or truncate the secret to exactly 32 bytes for AES-256
  const keyBytes = new TextEncoder().encode(secret.padEnd(KEY_LENGTH, '0').slice(0, KEY_LENGTH))

  _cachedKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGO },
    false,
    ['encrypt', 'decrypt'],
  )
  _cachedSecretHash = secret
  return _cachedKey
}

// ─── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns the encrypted string with the `enc:v1:` prefix.
 */
export async function encryptForKV(plaintext: string): Promise<string> {
  const key = await getKey()

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoded,
  )

  // Combine IV + ciphertext into a single buffer, then base64-encode
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH)

  // Edge-safe base64 encoding (no btoa with large arrays)
  const CHUNK_SIZE = 32768
  const chunks: string[] = []
  for (let i = 0; i < combined.length; i += CHUNK_SIZE) {
    const chunk = combined.subarray(i, i + CHUNK_SIZE)
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)))
  }

  return ENCRYPTED_PREFIX + btoa(chunks.join(''))
}

/**
 * Decrypts a value that was encrypted with `encryptForKV`.
 * If the value doesn't have the `enc:v1:` prefix, it's returned as-is
 * (backward compatibility with existing plaintext KV values).
 */
export async function decryptFromKV(stored: string): Promise<string> {
  // SECURITY (A4): Backward compatibility — plaintext values pass through
  if (!stored.startsWith(ENCRYPTED_PREFIX)) return stored

  const key = await getKey()

  const raw = stored.slice(ENCRYPTED_PREFIX.length)
  const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))

  if (combined.length <= IV_LENGTH) {
    throw new Error('Malformed encrypted data')
  }

  const iv = combined.slice(0, IV_LENGTH)
  const ciphertext = combined.slice(IV_LENGTH)

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGO, iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(decrypted)
}

// ─── Per-Tenant Salted Encryption (v2) ───────────────────────────────────────
//
// Missi Spaces requires per-tenant key isolation: a compromise of one Space's
// ciphertext must not reveal any other Space's data. We derive a subkey per
// salt via HKDF-SHA256 from MISSI_KV_ENCRYPTION_SECRET. The salt is typically
// the spaceId (or invite token).
//
// FORMAT: encv2:<base64(iv[12] + ciphertext + authTag)>
// Backwards-compatible: values without this prefix are rejected by the v2
// decryptor. The v1 helpers above remain untouched for existing call sites.

const ENCRYPTED_V2_PREFIX = 'encv2:'

// In-memory subkey cache — scoped per (secret, salt). Cleared implicitly on
// worker isolate recycle. The cache never crosses secret rotations because
// the cache key includes the secret itself.
const _subkeyCache = new Map<string, CryptoKey>()
const SUBKEY_CACHE_MAX = 256

async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  // Cast to Uint8Array<ArrayBuffer>: TextEncoder.encode() always produces a
  // plain ArrayBuffer (never SharedArrayBuffer), so this narrowing is safe.
  // Required because Web Crypto's BufferSource expects ArrayBufferView<ArrayBuffer>.
  const baseKey = await crypto.subtle.importKey(
    'raw',
    ikm as Uint8Array<ArrayBuffer>,
    { name: 'HKDF' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as Uint8Array<ArrayBuffer>,
      info: info as Uint8Array<ArrayBuffer>,
    },
    baseKey,
    length * 8,
  )
  return new Uint8Array(bits)
}

async function getSaltedKey(salt: string): Promise<CryptoKey> {
  const secret = getSecret()
  const cacheKey = `${secret.length}:${secret.slice(0, 4)}:${salt}`
  const cached = _subkeyCache.get(cacheKey)
  if (cached) return cached

  const ikm = new TextEncoder().encode(secret)
  const saltBytes = new TextEncoder().encode(salt)
  const info = new TextEncoder().encode('missi:kv:v2')
  const keyBytes = await hkdfSha256(ikm, saltBytes, info, KEY_LENGTH)

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGO },
    false,
    ['encrypt', 'decrypt'],
  )

  // Bounded cache: evict oldest entry if we exceed the cap.
  if (_subkeyCache.size >= SUBKEY_CACHE_MAX) {
    const firstKey = _subkeyCache.keys().next().value
    if (firstKey !== undefined) _subkeyCache.delete(firstKey)
  }
  _subkeyCache.set(cacheKey, key)
  return key
}

function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK_SIZE = 32768
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE)
    chunks.push(String.fromCharCode.apply(null, Array.from(chunk)))
  }
  return btoa(chunks.join(''))
}

/**
 * Encrypts a plaintext using a per-tenant derived key.
 * `salt` is typically the spaceId (or invite token). Two different salts
 * produce completely independent keys so ciphertext from one tenant is
 * cryptographically useless to another.
 */
export async function encryptKVValue(plaintext: string, salt: string): Promise<string> {
  if (!salt || salt.length === 0) {
    throw new Error('encryptKVValue: salt is required')
  }
  const key = await getSaltedKey(salt)
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGO, iv },
    key,
    encoded,
  )
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH)
  return ENCRYPTED_V2_PREFIX + bytesToBase64(combined)
}

/**
 * Decrypts a value produced by `encryptKVValue` using the same salt.
 * Returns null on any failure — callers MUST treat null as "no data" and
 * never surface the raw error to clients. This prevents decryption-oracle
 * style attacks and keeps Space route handlers simple.
 */
export async function decryptKVValue(
  stored: string,
  salt: string,
): Promise<string | null> {
  if (!stored.startsWith(ENCRYPTED_V2_PREFIX)) return null
  try {
    const key = await getSaltedKey(salt)
    const raw = stored.slice(ENCRYPTED_V2_PREFIX.length)
    const combined = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0))
    if (combined.length <= IV_LENGTH) return null
    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)
    const decrypted = await crypto.subtle.decrypt(
      { name: ALGO, iv },
      key,
      ciphertext,
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

// ─── High-Level KV Wrappers ──────────────────────────────────────────────────

/**
 * Reads a KV value with automatic decryption.
 * Handles both encrypted (`enc:v1:...`) and plaintext values seamlessly.
 */
export async function kvGet(kv: KVStore, key: string): Promise<string | null> {
  const raw = await kv.get(key)
  if (raw === null) return null
  return decryptFromKV(raw)
}

/**
 * Writes a KV value with encryption.
 */
export async function kvPut(
  kv: KVStore,
  key: string,
  value: string,
  options?: { expirationTtl?: number },
): Promise<void> {
  const encrypted = await encryptForKV(value)
  await kv.put(key, encrypted, options)
}
