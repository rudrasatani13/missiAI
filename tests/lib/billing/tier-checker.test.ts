import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock clerkClient before importing the module
const mockGetUser = vi.fn()
const mockUpdateUser = vi.fn()

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: mockGetUser,
      updateUser: mockUpdateUser,
    },
  })),
}))

import { getUserPlan, setUserPlan, getUserBillingData } from '@/lib/billing/tier-checker'

describe('tier-checker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getUserPlan', () => {
    it('returns "pro" when publicMetadata.plan is "pro"', async () => {
      mockGetUser.mockResolvedValue({
        publicMetadata: { plan: 'pro' },
      })
      const plan = await getUserPlan('user_123')
      expect(plan).toBe('pro')
    })

    it('returns "plus" when publicMetadata.plan is "plus"', async () => {
      mockGetUser.mockResolvedValue({
        publicMetadata: { plan: 'plus' },
      })
      const plan = await getUserPlan('user_123')
      expect(plan).toBe('plus')
    })

    it('returns "free" when no publicMetadata', async () => {
      mockGetUser.mockResolvedValue({
        publicMetadata: {},
      })
      const plan = await getUserPlan('user_123')
      expect(plan).toBe('free')
    })

    it('returns "free" when publicMetadata.plan is unknown', async () => {
      mockGetUser.mockResolvedValue({
        publicMetadata: { plan: 'unknown' },
      })
      const plan = await getUserPlan('user_123')
      expect(plan).toBe('free')
    })
  })

  describe('getUserBillingData', () => {
    it('returns billing data with defaults for free user', async () => {
      mockGetUser.mockResolvedValue({
        publicMetadata: {},
      })
      const billing = await getUserBillingData('user_456')
      expect(billing.userId).toBe('user_456')
      expect(billing.planId).toBe('free')
      expect(billing.dodoCustomerId).toBeUndefined()
    })

    it('returns billing data with dodo info for pro user', async () => {
      mockGetUser.mockResolvedValue({
        publicMetadata: {
          plan: 'pro',
          dodoCustomerId: 'cust_dodo_abc',
          dodoSubscriptionId: 'sub_dodo_xyz',
          currentPeriodEnd: 1700000000000,
        },
      })
      const billing = await getUserBillingData('user_789')
      expect(billing.planId).toBe('pro')
      expect(billing.dodoCustomerId).toBe('cust_dodo_abc')
      expect(billing.dodoSubscriptionId).toBe('sub_dodo_xyz')
      expect(billing.currentPeriodEnd).toBe(1700000000000)
    })
  })

  describe('setUserPlan', () => {
    it('calls updateUser with correct metadata', async () => {
      mockGetUser.mockResolvedValue({
        publicMetadata: {},
      })
      mockUpdateUser.mockResolvedValue({})
      await setUserPlan('user_123', 'pro', {
        dodoCustomerId: 'cust_dodo_test',
        dodoSubscriptionId: 'sub_dodo_test',
        currentPeriodEnd: 1234567890,
      })
      expect(mockUpdateUser).toHaveBeenCalledWith('user_123', {
        publicMetadata: {
          plan: 'pro',
          dodoCustomerId: 'cust_dodo_test',
          dodoSubscriptionId: 'sub_dodo_test',
          currentPeriodEnd: 1234567890,
        },
      })
    })
  })
})
