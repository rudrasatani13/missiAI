import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { createDodoCheckoutSession, getDodoSubscription, cancelDodoSubscription, determinePlanFromDodoProduct, verifyDodoWebhook } from '@/lib/billing/dodo-client'
import { timingSafeCompare } from '@/lib/server/security/crypto-utils'

vi.mock('@/lib/server/security/crypto-utils', () => ({
  timingSafeCompare: vi.fn(),
}))

describe('dodo-client', () => {
  const originalEnv = process.env
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    process.env = { ...originalEnv, DODO_PAYMENTS_API_KEY: 'test_key', DODO_PLUS_PRODUCT_ID: 'prod_plus', DODO_PRO_PRODUCT_ID: 'prod_pro' }
    global.fetch = mockFetch
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  describe('createDodoCheckoutSession', () => {
    it('successfully creates a checkout session', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          session_id: 'sess_123',
          checkout_url: 'https://checkout.dodo.com/sess_123',
        }),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const params = {
        productId: 'prod_123',
        customerEmail: 'test@example.com',
        customerName: 'Test User',
        returnUrl: 'https://example.com/return',
        metadata: { userId: 'user_123' }
      }

      const result = await createDodoCheckoutSession(params)

      expect(result).toEqual({
        session_id: 'sess_123',
        checkout_url: 'https://checkout.dodo.com/sess_123',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://live.dodopayments.com/checkouts',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            product_cart: [{ product_id: 'prod_123', quantity: 1 }],
            customer: { email: 'test@example.com', name: 'Test User' },
            return_url: 'https://example.com/return',
            metadata: { userId: 'user_123' }
          }),
        })
      )
    })

    it('handles alternative response format (id/url)', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          id: 'sess_123_alt',
          url: 'https://checkout.dodo.com/sess_123_alt',
        }),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const params = {
        productId: 'prod_123',
        customerEmail: 'test@example.com',
        returnUrl: 'https://example.com/return',
      }

      const result = await createDodoCheckoutSession(params)

      expect(result).toEqual({
        session_id: 'sess_123_alt',
        checkout_url: 'https://checkout.dodo.com/sess_123_alt',
      })
    })

    it('handles API errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ message: 'Invalid product ID' }),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const params = {
        productId: 'invalid_prod',
        customerEmail: 'test@example.com',
        returnUrl: 'https://example.com/return',
      }

      await expect(createDodoCheckoutSession(params)).rejects.toThrow('Dodo checkout session creation failed (HTTP 400)')
    })

    it('handles fetch exceptions gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const params = {
        productId: 'prod_123',
        customerEmail: 'test@example.com',
        returnUrl: 'https://example.com/return',
      }

      await expect(createDodoCheckoutSession(params)).rejects.toThrow('Dodo checkout session creation failed')
    })
  })

  describe('getDodoSubscription', () => {
    it('successfully fetches a subscription', async () => {
      const mockSubData = {
        subscription_id: 'sub_123',
        status: 'active',
        product_id: 'prod_123',
        customer: { customer_id: 'cust_123', email: 'test@example.com' },
        current_period_end: 1672531200,
        metadata: {}
      }
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue(mockSubData),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const result = await getDodoSubscription('sub_123')

      expect(result).toEqual(mockSubData)
      expect(mockFetch).toHaveBeenCalledWith(
        'https://live.dodopayments.com/subscriptions/sub_123',
        expect.objectContaining({
          method: 'GET',
          headers: {
            'Authorization': 'Bearer test_key',
          },
        })
      )
    })

    it('handles API errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({ message: 'Subscription not found' }),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(getDodoSubscription('invalid_sub')).rejects.toThrow('Dodo subscription fetch failed (HTTP 404)')
    })
  })

  describe('cancelDodoSubscription', () => {
    it('successfully cancels a subscription', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      await cancelDodoSubscription('sub_123')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://live.dodopayments.com/subscriptions/sub_123',
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer test_key',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status: 'cancelled' }),
        })
      )
    })

    it('handles API errors gracefully', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ message: 'Cannot cancel already cancelled subscription' }),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      await expect(cancelDodoSubscription('sub_123')).rejects.toThrow('Dodo subscription cancel failed (HTTP 400)')
    })
  })

  describe('determinePlanFromDodoProduct', () => {
    it('returns plus for plus product ID', () => {
      expect(determinePlanFromDodoProduct('prod_plus')).toBe('plus')
    })

    it('returns pro for pro product ID', () => {
      expect(determinePlanFromDodoProduct('prod_pro')).toBe('pro')
    })

    it('returns free for unknown product ID', () => {
      expect(determinePlanFromDodoProduct('prod_unknown')).toBe('free')
    })
  })

  describe('verifyDodoWebhook', () => {
    it('rejects missing headers', async () => {
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'sig', 'webhook-timestamp': '' }, 'secret')
      expect(result).toBe(false)
    })

    it('rejects old timestamps', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'sig', 'webhook-timestamp': oldTimestamp.toString() }, 'secret')
      expect(result).toBe(false)
    })

    it('returns false for invalid signature', async () => {
      vi.mocked(timingSafeCompare).mockResolvedValueOnce(false)
      const validTimestamp = Math.floor(Date.now() / 1000).toString()
      const secret = btoa('test_secret')
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'v1,invalid_sig', 'webhook-timestamp': validTimestamp }, secret)
      expect(result).toBe(false)
    })

    it('returns true for valid signature', async () => {
      vi.mocked(timingSafeCompare).mockResolvedValueOnce(true)
      const validTimestamp = Math.floor(Date.now() / 1000).toString()
      const secret = btoa('test_secret')
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'v1,valid_sig', 'webhook-timestamp': validTimestamp }, secret)
      expect(result).toBe(true)
    })
  })

  describe('edge cases', () => {
    it('parseDodoError catch block returns fallback message', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: vi.fn().mockRejectedValue(new Error('JSON parse error')),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const params = {
        productId: 'prod_123',
        customerEmail: 'test@example.com',
        returnUrl: 'https://example.com/return',
      }
      await expect(createDodoCheckoutSession(params)).rejects.toThrow('Dodo checkout session creation failed (HTTP 500)')
    })

    it('verifyDodoWebhook handles missing whsec_ prefix', async () => {
      vi.mocked(timingSafeCompare).mockResolvedValueOnce(true)
      const validTimestamp = Math.floor(Date.now() / 1000).toString()
      const secretWithoutPrefix = btoa('test_secret')
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'v1,valid_sig', 'webhook-timestamp': validTimestamp }, secretWithoutPrefix)
      expect(result).toBe(true)
    })

    it('verifyDodoWebhook handles whsec_ prefix', async () => {
      vi.mocked(timingSafeCompare).mockResolvedValueOnce(true)
      const validTimestamp = Math.floor(Date.now() / 1000).toString()
      const secretWithPrefix = `whsec_${btoa('test_secret')}`
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'v1,valid_sig', 'webhook-timestamp': validTimestamp }, secretWithPrefix)
      expect(result).toBe(true)
    })

    it('verifyDodoWebhook handles crypto exceptions', async () => {
      // Intentionally cause an exception by providing invalid base64 secret to base64Decode
      const validTimestamp = Math.floor(Date.now() / 1000).toString()
      const invalidSecret = 'not-base-64-!@#'
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'v1,valid_sig', 'webhook-timestamp': validTimestamp }, invalidSecret)
      expect(result).toBe(false)
    })
  })

  describe('auth and base URLs', () => {
    it('uses test base URL in test mode', async () => {
      process.env.DODO_PAYMENTS_MODE = 'test_mode'
      const mockResponse = { ok: true, json: vi.fn().mockResolvedValue({}) }
      mockFetch.mockResolvedValueOnce(mockResponse)

      await createDodoCheckoutSession({
        productId: 'prod_1',
        customerEmail: 'test@example.com',
        returnUrl: 'url'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://test.dodopayments.com'),
        expect.any(Object)
      )
    })

    it('throws when DODO_PAYMENTS_API_KEY is missing in getDodoSubscription', async () => {
      delete process.env.DODO_PAYMENTS_API_KEY
      await expect(getDodoSubscription('sub_1')).rejects.toThrow('Missing DODO_PAYMENTS_API_KEY')
    })

    it('throws when DODO_PAYMENTS_API_KEY is missing in cancelDodoSubscription', async () => {
      delete process.env.DODO_PAYMENTS_API_KEY
      await expect(cancelDodoSubscription('sub_1')).rejects.toThrow('Missing DODO_PAYMENTS_API_KEY')
    })
  })

  describe('webhook signature edge cases', () => {
    it('skips invalid signature format', async () => {
      vi.mocked(timingSafeCompare).mockResolvedValue(false)
      const validTimestamp = Math.floor(Date.now() / 1000).toString()
      const secret = btoa('test_secret')
      const result = await verifyDodoWebhook('body', { 'webhook-id': '1', 'webhook-signature': 'invalid_format v2,sig', 'webhook-timestamp': validTimestamp }, secret)
      expect(result).toBe(false)
    })
  })

  describe('parseDodoError detail handling', () => {
    it('uses body.error when body.message is missing', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({ error: 'Fallback error details' }),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const params = {
        productId: 'prod_123',
        customerEmail: 'test@example.com',
        returnUrl: 'https://example.com/return',
      }
      await expect(createDodoCheckoutSession(params)).rejects.toThrow('Dodo checkout session creation failed (HTTP 400)')
    })

    it('uses fallbackMessage when body is empty', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        json: vi.fn().mockResolvedValue({}),
      }
      mockFetch.mockResolvedValueOnce(mockResponse)

      const params = {
        productId: 'prod_123',
        customerEmail: 'test@example.com',
        returnUrl: 'https://example.com/return',
      }
      await expect(createDodoCheckoutSession(params)).rejects.toThrow('Dodo checkout session creation failed (HTTP 400)')
    })
  })
})
