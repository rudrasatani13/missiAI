import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  getCloudflareKVBindingMock,
  verifyDodoWebhookMock,
  determinePlanFromDodoProductMock,
  setUserPlanMock,
  logMock,
  logSecurityEventMock,
} = vi.hoisted(() => ({
  getCloudflareKVBindingMock: vi.fn(),
  verifyDodoWebhookMock: vi.fn(),
  determinePlanFromDodoProductMock: vi.fn(),
  setUserPlanMock: vi.fn(),
  logMock: vi.fn(),
  logSecurityEventMock: vi.fn(),
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock('@/lib/billing/dodo-client', () => ({
  verifyDodoWebhook: verifyDodoWebhookMock,
  determinePlanFromDodoProduct: determinePlanFromDodoProductMock,
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  setUserPlan: setUserPlanMock,
}))

vi.mock('@/lib/server/observability/logger', () => ({
  log: logMock,
  logSecurityEvent: logSecurityEventMock,
}))

import { POST } from '@/app/api/webhooks/dodo/route'

const kv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

function makeRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://missi.space/api/webhooks/dodo', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'evt_123',
      'webhook-signature': 'sig_123',
      'webhook-timestamp': '1234567890',
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

describe('Dodo webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DODO_WEBHOOK_SECRET = 'whsec_test'
    getCloudflareKVBindingMock.mockReturnValue(kv)
    verifyDodoWebhookMock.mockResolvedValue(true)
    determinePlanFromDodoProductMock.mockReturnValue('pro')
    setUserPlanMock.mockResolvedValue(undefined)
    kv.get.mockResolvedValue(null)
    kv.put.mockResolvedValue(undefined)
  })

  it('rejects invalid webhook signatures without mutating billing state', async () => {
    verifyDodoWebhookMock.mockResolvedValueOnce(false)

    const res = await POST(makeRequest({ type: 'subscription.active' }))

    expect(res.status).toBe(401)
    await expect(res.json()).resolves.toMatchObject({ received: false, error: 'Invalid signature' })
    expect(setUserPlanMock).not.toHaveBeenCalled()
    expect(kv.put).not.toHaveBeenCalled()
    expect(logSecurityEventMock).toHaveBeenCalledWith(
      'security.webhook.invalid_signature',
      expect.objectContaining({ path: '/api/webhooks/dodo' }),
    )
  })

  it('skips duplicate events without mutating billing state', async () => {
    kv.get.mockImplementation(async (key: string) => (
      key === 'webhook:event:subscription.active:evt_123' ? '1' : null
    ))

    const res = await POST(makeRequest({ type: 'subscription.active' }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true, duplicate: true })
    expect(setUserPlanMock).not.toHaveBeenCalled()
    expect(kv.put).not.toHaveBeenCalled()
  })

  it('updates the plan and marks the event processed after successful handling', async () => {
    const res = await POST(makeRequest({
      type: 'subscription.active',
      data: {
        subscription_id: 'sub_123',
        product_id: 'prod_pro',
        metadata: { userId: 'user_123' },
        customer_id: 'cust_123',
        current_period_end: '2026-05-01T00:00:00.000Z',
      },
    }))

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ received: true })
    expect(determinePlanFromDodoProductMock).toHaveBeenCalledWith('prod_pro')
    expect(setUserPlanMock).toHaveBeenCalledWith(
      'user_123',
      'pro',
      expect.objectContaining({
        dodoSubscriptionId: 'sub_123',
        dodoCustomerId: 'cust_123',
        cancelAtPeriodEnd: false,
      }),
    )
    expect(kv.put).toHaveBeenCalledWith('dodo:sub:sub_123', 'user_123')
    expect(kv.put).toHaveBeenCalledWith(
      'webhook:event:subscription.active:evt_123',
      '1',
      { expirationTtl: 86400 },
    )
  })

  it('returns 500 so Dodo retries when idempotency marking fails after billing mutation', async () => {
    kv.put.mockImplementation(async (key: string) => {
      if (key === 'webhook:event:subscription.active:evt_123') {
        throw new Error('idempotency write failed')
      }
    })

    const res = await POST(makeRequest({
      type: 'subscription.active',
      data: {
        subscription_id: 'sub_123',
        product_id: 'prod_pro',
        metadata: { userId: 'user_123' },
      },
    }))

    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ received: false, error: 'Handler failed' })
    expect(setUserPlanMock).toHaveBeenCalledWith(
      'user_123',
      'pro',
      expect.objectContaining({ dodoSubscriptionId: 'sub_123' }),
    )
    expect(logMock).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      event: 'billing.webhook.error',
      metadata: expect.objectContaining({
        eventType: 'subscription.active',
        error: 'idempotency write failed',
      }),
    }))
  })
})
