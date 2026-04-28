import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { determinePlanFromDodoProduct } from '@/lib/billing/dodo-client'

describe('determinePlanFromDodoProduct', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    process.env.DODO_PLUS_PRODUCT_ID = 'prod_plus_123'
    process.env.DODO_PRO_PRODUCT_ID = 'prod_pro_456'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('returns "plus" when productId matches DODO_PLUS_PRODUCT_ID', () => {
    expect(determinePlanFromDodoProduct('prod_plus_123')).toBe('plus')
  })

  it('returns "pro" when productId matches DODO_PRO_PRODUCT_ID', () => {
    expect(determinePlanFromDodoProduct('prod_pro_456')).toBe('pro')
  })

  it('returns "free" when productId is unknown', () => {
    expect(determinePlanFromDodoProduct('unknown_product_id')).toBe('free')
  })

  it('returns "free" when productId is empty', () => {
    expect(determinePlanFromDodoProduct('')).toBe('free')
  })

  it('returns "free" when environment variables are not set', () => {
    delete process.env.DODO_PLUS_PRODUCT_ID
    delete process.env.DODO_PRO_PRODUCT_ID
    // If env vars are undefined, checking against them should also fall back to free
    expect(determinePlanFromDodoProduct('prod_plus_123')).toBe('free')
  })
})
