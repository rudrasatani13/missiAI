import { describe, it, expect, vi, beforeEach } from 'vitest'
import { stripeFormEncode, verifyWebhookSignature } from '@/lib/billing/stripe-client'

describe('stripe-client', () => {
  describe('stripeFormEncode', () => {
    it('encodes simple key-value pairs', () => {
      const result = stripeFormEncode({ a: 'b', c: 'd' })
      expect(result).toBe('a=b&c=d')
    })

    it('URL-encodes special characters', () => {
      const result = stripeFormEncode({ 'key with spaces': 'value&special=chars' })
      expect(result).toBe('key%20with%20spaces=value%26special%3Dchars')
    })

    it('filters empty values', () => {
      const result = stripeFormEncode({ a: 'b', c: '', d: 'e' })
      expect(result).toBe('a=b&d=e')
    })
  })

  describe('verifyWebhookSignature', () => {
    it('returns false with wrong secret', async () => {
      const result = await verifyWebhookSignature(
        '{"type":"test"}',
        `t=${Math.floor(Date.now() / 1000)},v1=invalidsignature`,
        'whsec_wrong'
      )
      expect(result).toBe(false)
    })

    it('returns false with expired timestamp', async () => {
      const expiredTs = Math.floor(Date.now() / 1000) - 600 // 10 minutes ago
      const result = await verifyWebhookSignature(
        '{"type":"test"}',
        `t=${expiredTs},v1=somesignature`,
        'whsec_test'
      )
      expect(result).toBe(false)
    })

    it('returns false with malformed signature header', async () => {
      const result = await verifyWebhookSignature(
        '{"type":"test"}',
        'malformed-header',
        'whsec_test'
      )
      expect(result).toBe(false)
    })

    it('returns true for valid HMAC signature', async () => {
      const payload = '{"type":"checkout.session.completed"}'
      const secret = 'whsec_testsecret123'
      const timestamp = Math.floor(Date.now() / 1000)
      const message = `${timestamp}.${payload}`

      // Compute expected HMAC
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
      const hexSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const result = await verifyWebhookSignature(
        payload,
        `t=${timestamp},v1=${hexSig}`,
        secret
      )
      expect(result).toBe(true)
    })
  })
})
