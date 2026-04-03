import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getRazorpayAuth, verifyRazorpayWebhook, verifyRazorpayPayment, determinePlanFromRazorpayPlan } from '@/lib/billing/razorpay-client'

describe('razorpay-client', () => {
  describe('getRazorpayAuth', () => {
    it('throws when RAZORPAY_KEY_ID is missing', () => {
      const origId = process.env.RAZORPAY_KEY_ID
      const origSecret = process.env.RAZORPAY_KEY_SECRET
      delete process.env.RAZORPAY_KEY_ID
      process.env.RAZORPAY_KEY_SECRET = 'test-secret'
      expect(() => getRazorpayAuth()).toThrow('Missing Razorpay credentials')
      if (origId) process.env.RAZORPAY_KEY_ID = origId
      if (origSecret) process.env.RAZORPAY_KEY_SECRET = origSecret
    })

    it('returns "Basic {base64}" when keys present', () => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_abc'
      process.env.RAZORPAY_KEY_SECRET = 'secret_xyz'
      const auth = getRazorpayAuth()
      expect(auth).toBe('Basic ' + btoa('rzp_test_abc:secret_xyz'))
    })
  })

  describe('verifyRazorpayWebhook', () => {
    it('returns false with wrong secret', async () => {
      const payload = '{"event":"subscription.activated"}'
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

      const result = await verifyRazorpayWebhook(payload, hexSig, wrongSecret)
      expect(result).toBe(false)
    })

    it('returns true with correct HMAC', async () => {
      const payload = '{"event":"subscription.activated"}'
      const secret = 'razorpay-webhook-secret-test'

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

      const result = await verifyRazorpayWebhook(payload, hexSig, secret)
      expect(result).toBe(true)
    })

    it('returns false with empty signature', async () => {
      const result = await verifyRazorpayWebhook('{"event":"test"}', '', 'secret')
      expect(result).toBe(false)
    })
  })

  describe('verifyRazorpayPayment', () => {
    it('returns true with correct signature', async () => {
      const paymentId = 'pay_abc123'
      const subscriptionId = 'sub_xyz789'
      const keySecret = 'my-key-secret'
      const message = paymentId + '|' + subscriptionId

      const encoder = new TextEncoder()
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(keySecret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message))
      const hexSig = Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')

      const result = await verifyRazorpayPayment(paymentId, subscriptionId, hexSig, keySecret)
      expect(result).toBe(true)
    })

    it('returns false with wrong signature', async () => {
      const result = await verifyRazorpayPayment('pay_abc', 'sub_xyz', 'wrongsig', 'secret')
      expect(result).toBe(false)
    })
  })

  describe('determinePlanFromRazorpayPlan', () => {
    it('returns "pro" for matching RAZORPAY_PRO_PLAN_ID', () => {
      process.env.RAZORPAY_PRO_PLAN_ID = 'plan_pro_123'
      process.env.RAZORPAY_BUSINESS_PLAN_ID = 'plan_biz_456'
      expect(determinePlanFromRazorpayPlan('plan_pro_123')).toBe('pro')
    })

    it('returns "business" for matching RAZORPAY_BUSINESS_PLAN_ID', () => {
      process.env.RAZORPAY_PRO_PLAN_ID = 'plan_pro_123'
      process.env.RAZORPAY_BUSINESS_PLAN_ID = 'plan_biz_456'
      expect(determinePlanFromRazorpayPlan('plan_biz_456')).toBe('business')
    })

    it('returns "pro" (default) for unknown planId', () => {
      process.env.RAZORPAY_PRO_PLAN_ID = 'plan_pro_123'
      process.env.RAZORPAY_BUSINESS_PLAN_ID = 'plan_biz_456'
      expect(determinePlanFromRazorpayPlan('plan_unknown_789')).toBe('pro')
    })
  })

  describe('createRazorpayCustomer', () => {
    beforeEach(() => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
      process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
      vi.restoreAllMocks()
    })

    it('returns { id } on success', async () => {
      const { createRazorpayCustomer } = await import('@/lib/billing/razorpay-client')

      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify({ id: 'cust_razorpay_123' }), { status: 200 })
      ))

      const result = await createRazorpayCustomer({
        name: 'Test User',
        email: 'test@test.com',
      })

      expect(result.id).toBe('cust_razorpay_123')
    })
  })

  describe('createRazorpaySubscription', () => {
    beforeEach(() => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
      process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
      vi.restoreAllMocks()
    })

    it('returns { id, status } on success', async () => {
      const { createRazorpaySubscription } = await import('@/lib/billing/razorpay-client')

      vi.stubGlobal('fetch', vi.fn(async () =>
        new Response(JSON.stringify({
          id: 'sub_razorpay_456',
          status: 'created',
          short_url: 'https://rzp.io/i/abc',
        }), { status: 200 })
      ))

      const result = await createRazorpaySubscription({
        planId: 'plan_pro_123',
        customerId: 'cust_razorpay_123',
        totalCount: 120,
        notes: { userId: 'user_123' },
      })

      expect(result.id).toBe('sub_razorpay_456')
      expect(result.status).toBe('created')
    })
  })

  describe('fetch timeout', () => {
    beforeEach(() => {
      process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
      process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
      vi.restoreAllMocks()
    })

    it('throws error on timeout', async () => {
      const { createRazorpayCustomer } = await import('@/lib/billing/razorpay-client')

      vi.stubGlobal('fetch', vi.fn(async () => {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }))

      await expect(createRazorpayCustomer({
        name: 'Test User',
        email: 'test@test.com',
      })).rejects.toThrow()
    })
  })
})
