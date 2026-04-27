import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import type { BudgetSettings, ExpenseEntry } from '@/types/budget'

const {
  getVerifiedUserIdMock,
  getCloudflareKVBindingMock,
  getOrCreateSettingsMock,
  saveSettingsMock,
  getEntryByIdWithMonthMock,
  saveEntryMock,
} = vi.hoisted(() => ({
  getVerifiedUserIdMock: vi.fn(),
  getCloudflareKVBindingMock: vi.fn(),
  getOrCreateSettingsMock: vi.fn(),
  saveSettingsMock: vi.fn(),
  getEntryByIdWithMonthMock: vi.fn(),
  saveEntryMock: vi.fn(),
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: getVerifiedUserIdMock,
  AuthenticationError: class AuthenticationError extends Error {},
  unauthorizedResponse: vi.fn(() => new Response(JSON.stringify({ success: false }), { status: 401 })),
}))

vi.mock('@/lib/server/platform/bindings', () => ({
  getCloudflareKVBinding: getCloudflareKVBindingMock,
}))

vi.mock('@/lib/budget/budget-store', () => ({
  getOrCreateSettings: getOrCreateSettingsMock,
  saveSettings: saveSettingsMock,
  getEntryByIdWithMonth: getEntryByIdWithMonthMock,
  saveEntry: saveEntryMock,
  deleteEntry: vi.fn(),
}))

import { POST as postBudgetSettings } from '@/app/api/v1/budget/settings/route'
import { PATCH as patchBudgetEntry } from '@/app/api/v1/budget/entries/[entryId]/route'

const kv = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}

const existingSettings: BudgetSettings = {
  userId: 'user_123',
  preferredCurrency: 'USD',
  defaultView: 'overview',
  limits: [],
  updatedAt: 1,
}

const existingEntry: ExpenseEntry = {
  id: 'entry_1',
  userId: 'user_123',
  amount: 10,
  currency: 'USD',
  category: 'food',
  description: 'Lunch',
  date: '2026-04-27',
  createdAt: 1,
  updatedAt: 1,
  source: 'manual',
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('https://missi.space/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('budget route currency validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVerifiedUserIdMock.mockResolvedValue('user_123')
    getCloudflareKVBindingMock.mockReturnValue(kv)
    getOrCreateSettingsMock.mockResolvedValue(existingSettings)
    saveSettingsMock.mockResolvedValue(existingSettings)
    getEntryByIdWithMonthMock.mockResolvedValue({ entry: existingEntry, yearMonth: '2026-04' })
    saveEntryMock.mockResolvedValue(existingEntry)
  })

  it('rejects unsupported preferred budget settings currency', async () => {
    const res = await postBudgetSettings(makeRequest({ preferredCurrency: 'ZZZ' }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: 'Unsupported currency',
      code: 'VALIDATION_ERROR',
    })
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported budget limit currency', async () => {
    const res = await postBudgetSettings(makeRequest({
      limits: [{ category: 'food', amount: 100, currency: 'ZZZ' }],
    }))

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: 'Unsupported currency',
      code: 'VALIDATION_ERROR',
    })
    expect(saveSettingsMock).not.toHaveBeenCalled()
  })

  it('rejects unsupported currency when patching a budget entry', async () => {
    const res = await patchBudgetEntry(
      makeRequest({ currency: 'ZZZ' }),
      { params: Promise.resolve({ entryId: 'entry_1' }) },
    )

    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: 'Unsupported currency',
      code: 'VALIDATION_ERROR',
    })
    expect(saveEntryMock).not.toHaveBeenCalled()
  })
})
