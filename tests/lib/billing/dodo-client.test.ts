import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getDodoKey, verifyDodoWebhook, determinePlanFromProduct } from '@/lib/billing/dodo-client'

describe('dodo-client', () => {
  describe('getDodoKey', () => {
    it('throws when DODO_API_KEY is missing', () => {
      const original = process.env.DODO_API_KEY
      delete process.env.DODO_API_KEY
      expect(() => getDodoKey()).toThrow('Missing DODO_API_KEY')
      if (original) process.env.DODO_API_KEY = original
    })

    it('returns key when present', () => {
      process.env.DODO_API_KEY = 'test-dodo-key-123'
      expect(getDodoKey()).toBe('test-dodo-key-123')
    })
  })

  describe('verifyDodoWebhook', () => {
    it('returns false with wrong secret', async () => {
      const payload = '{"type":"test"}'
      const secret = 'correct-secret'
      const wrongSecret = 'wrong-secret'

      // Compute HMAC with the correct secret
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
      const hexSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const result = await verifyDodoWebhook(payload, hexSig, wrongSecret)
      expect(result).toBe(false)
    })

    it('returns true with correct HMAC', async () => {
      const payload = '{"type":"subscription.active"}'
      const secret = 'dodo-webhook-secret-test'

      // Compute expected HMAC
      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
      const hexSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const result = await verifyDodoWebhook(payload, hexSig, secret)
      expect(result).toBe(true)
    })

    it('returns false with empty signature', async () => {
      const result = await verifyDodoWebhook('{"type":"test"}', '', 'secret')
      expect(result).toBe(false)
    })
  })

  describe('createDodoCheckout', () => {
    beforeEach(() => {
      process.env.DODO_API_KEY = 'test-dodo-key'
      vi.restoreAllMocks()
    })

    it('returns subscriptionId and checkoutUrl on success', async () => {
      const { createDodoCheckout } = await import('@/lib/billing/dodo-client')

      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify({
          subscription_id: 'sub_dodo_123',
          payment_link: 'https://checkout.dodopayments.com/abc',
        }), { status: 200 })
      ))

      const result = await createDodoCheckout({
        productId: 'prod_abc',
        successUrl: 'https://missi.space/pricing?success=true',
        cancelUrl: 'https://missi.space/pricing?canceled=true',
        customerUserId: 'user_123',
        customerEmail: 'test@test.com',
      })

      expect(result.subscriptionId).toBe('sub_dodo_123')
      expect(result.checkoutUrl).toBe('https://checkout.dodopayments.com/abc')
    })

    it('throws on 400 response', async () => {
      const { createDodoCheckout } = await import('@/lib/billing/dodo-client')

      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response('Bad Request', { status: 400 })
      ))

      await expect(createDodoCheckout({
        productId: 'prod_abc',
        successUrl: 'https://missi.space/pricing?success=true',
        cancelUrl: 'https://missi.space/pricing?canceled=true',
        customerUserId: 'user_123',
      })).rejects.toThrow('Dodo checkout failed: 400')
    })

    it('throws on AbortController timeout', async () => {
      const { createDodoCheckout } = await import('@/lib/billing/dodo-client')

      vi.stubGlobal('fetch', vi.fn(async (_url: string, opts: any) => {
        // Immediately check if signal is already aborted, then abort it manually
        const controller = new AbortController()
        controller.abort()
        throw new DOMException('The operation was aborted.', 'AbortError')
      }))

      await expect(createDodoCheckout({
        productId: 'prod_abc',
        successUrl: 'https://missi.space/pricing?success=true',
        cancelUrl: 'https://missi.space/pricing?canceled=true',
        customerUserId: 'user_123',
      })).rejects.toThrow()
    })
  })

  describe('determinePlanFromProduct', () => {
    it('returns "pro" for matching DODO_PRO_PRODUCT_ID', () => {
      process.env.DODO_PRO_PRODUCT_ID = 'prod_pro_123'
      process.env.DODO_BUSINESS_PRODUCT_ID = 'prod_biz_456'
      expect(determinePlanFromProduct('prod_pro_123')).toBe('pro')
    })

    it('returns "business" for matching DODO_BUSINESS_PRODUCT_ID', () => {
      process.env.DODO_PRO_PRODUCT_ID = 'prod_pro_123'
      process.env.DODO_BUSINESS_PRODUCT_ID = 'prod_biz_456'
      expect(determinePlanFromProduct('prod_biz_456')).toBe('business')
    })

    it('returns "pro" (default) for unknown productId', () => {
      process.env.DODO_PRO_PRODUCT_ID = 'prod_pro_123'
      process.env.DODO_BUSINESS_PRODUCT_ID = 'prod_biz_456'
      expect(determinePlanFromProduct('prod_unknown_789')).toBe('pro')
    })
  })
})
