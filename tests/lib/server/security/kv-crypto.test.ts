import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { MIN_SECRET_LENGTH } from '@/lib/server/security/kv-crypto'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STRONG_SECRET = 'a'.repeat(32) // 32 chars — minimum valid
const RECOMMENDED_SECRET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef012' // 35 chars

// ─── MIN_SECRET_LENGTH constant ──────────────────────────────────────────────

describe('MIN_SECRET_LENGTH', () => {
  it('is exported and equals 32', () => {
    expect(MIN_SECRET_LENGTH).toBe(32)
  })
})

// ─── getSecret / production enforcement ──────────────────────────────────────

describe('getSecret() production enforcement (via encryptForKV)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws when secret is missing in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', '')
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    await expect(encryptForKV('test')).rejects.toThrow('MISSI_KV_ENCRYPTION_SECRET is required')
  })

  it('throws when secret is shorter than 32 chars in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', 'tooshort')
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    await expect(encryptForKV('test')).rejects.toThrow(
      /must be at least 32 characters in production/,
    )
  })

  it('error message includes generation hint', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', 'short')
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    await expect(encryptForKV('test')).rejects.toThrow(/openssl rand -base64 32/)
  })

  it('error message does NOT include the secret value', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const secretValue = 'secretvalue123'
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', secretValue)
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    try {
      await encryptForKV('test')
      expect.fail('should have thrown')
    } catch (err) {
      expect(String(err)).not.toContain(secretValue)
    }
  })

  it('succeeds when secret is exactly 32 chars in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', STRONG_SECRET)
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    const result = await encryptForKV('hello')
    expect(result).toMatch(/^enc:v1:/)
  })

  it('succeeds when secret is longer than 32 chars in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', RECOMMENDED_SECRET)
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    const result = await encryptForKV('hello')
    expect(result).toMatch(/^enc:v1:/)
  })
})

// ─── development leniency ─────────────────────────────────────────────────────

describe('getSecret() development leniency (via encryptForKV)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('allows a short secret in development (does not throw on length)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', 'short')
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    const result = await encryptForKV('hello')
    expect(result).toMatch(/^enc:v1:/)
  })

  it('still throws when secret is missing in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', '')
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    await expect(encryptForKV('test')).rejects.toThrow('MISSI_KV_ENCRYPTION_SECRET is required')
  })

  it('still throws when secret is whitespace-only in development', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', '   ')
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    await expect(encryptForKV('test')).rejects.toThrow('MISSI_KV_ENCRYPTION_SECRET is required')
  })
})

// ─── encrypt / decrypt round-trip ────────────────────────────────────────────

describe('encrypt / decrypt round-trip', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', STRONG_SECRET)
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('encrypts plaintext to enc:v1: format', async () => {
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    const encrypted = await encryptForKV('my secret value')
    expect(encrypted).toMatch(/^enc:v1:/)
    expect(encrypted).not.toContain('my secret value')
  })

  it('decrypts an encrypted value back to original', async () => {
    const { encryptForKV, decryptFromKV } = await import('@/lib/server/security/kv-crypto')
    const plaintext = 'hello world 123'
    const encrypted = await encryptForKV(plaintext)
    const decrypted = await decryptFromKV(encrypted)
    expect(decrypted).toBe(plaintext)
  })

  it('passes plaintext values through decryptFromKV unchanged (backward compat)', async () => {
    const { decryptFromKV } = await import('@/lib/server/security/kv-crypto')
    const plain = 'not-encrypted'
    expect(await decryptFromKV(plain)).toBe(plain)
  })

  it('each encryption produces a unique ciphertext (IV randomness)', async () => {
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    const [a, b] = await Promise.all([encryptForKV('same'), encryptForKV('same')])
    expect(a).not.toBe(b)
  })

  it('throws on malformed encrypted data', async () => {
    const { decryptFromKV } = await import('@/lib/server/security/kv-crypto')
    await expect(decryptFromKV('enc:v1:bm90YmFzZTY0')).rejects.toThrow('Malformed encrypted data')
  })
})

// ─── key material correctness for valid secrets ───────────────────────────────

describe('v1 key derivation — stable key for valid secrets', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('32-char secret produces stable decrypt after module re-import (same key)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', STRONG_SECRET)
    vi.resetModules()
    const mod1 = await import('@/lib/server/security/kv-crypto')
    const encrypted = await mod1.encryptForKV('stable test')

    vi.resetModules()
    const mod2 = await import('@/lib/server/security/kv-crypto')
    const decrypted = await mod2.decryptFromKV(encrypted)
    expect(decrypted).toBe('stable test')
  })

  it('different 32-char secrets produce distinct keys (decryption fails cross-key)', async () => {
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', 'a'.repeat(32))
    vi.resetModules()
    const { encryptForKV } = await import('@/lib/server/security/kv-crypto')
    const encrypted = await encryptForKV('value')

    vi.unstubAllEnvs()
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MISSI_KV_ENCRYPTION_SECRET', 'b'.repeat(32))
    vi.resetModules()
    const { decryptFromKV } = await import('@/lib/server/security/kv-crypto')
    await expect(decryptFromKV(encrypted)).rejects.toThrow()
  })
})
