import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

let mockStateStore: any[] = []
let mockStateIdx = 0

vi.mock('react', () => ({
  useState: (initial: any) => {
    const idx = mockStateIdx++
    if (mockStateStore[idx] === undefined) mockStateStore[idx] = initial
    const setValue = (v: any) => {
      mockStateStore[idx] = typeof v === 'function' ? v(mockStateStore[idx]) : v
    }
    return [mockStateStore[idx], setValue]
  },
  useEffect: (fn: any, deps?: any[]) => {
    // we won't call it here to avoid automatic firing
  },
  useCallback: (fn: any) => fn,
}))

import { useAnalytics } from '@/hooks/useAnalytics'

function setupState(overrides: {
  snapshot?: any,
  planBreakdown?: any,
  isLoading?: boolean,
  error?: string | null,
  isForbidden?: boolean
} = {}) {
  mockStateStore = [
    overrides.snapshot !== undefined ? overrides.snapshot : null, // 0
    overrides.planBreakdown !== undefined ? overrides.planBreakdown : null, // 1
    overrides.isLoading !== undefined ? overrides.isLoading : true, // 2
    overrides.error !== undefined ? overrides.error : null, // 3
    overrides.isForbidden !== undefined ? overrides.isForbidden : false, // 4
  ]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockStateIdx = 0
  mockStateStore = []
  global.fetch = vi.fn() as any
})

describe('useAnalytics', () => {
  it('initial state is correct', () => {
    setupState()
    const result = useAnalytics()
    expect(result.snapshot).toBeNull()
    expect(result.planBreakdown).toBeNull()
    expect(result.isLoading).toBe(true)
    expect(result.error).toBeNull()
    expect(result.isForbidden).toBe(false)
  })
})

describe('formatNumber', () => {
  it('formats millions correctly', () => {
    setupState()
    const { formatNumber } = useAnalytics()
    expect(formatNumber(1500000)).toBe('1.5M')
    expect(formatNumber(2000000)).toBe('2.0M')
  })

  it('formats thousands correctly', () => {
    setupState()
    const { formatNumber } = useAnalytics()
    expect(formatNumber(1500)).toBe('1.5K')
    expect(formatNumber(999900)).toBe('999.9K')
  })

  it('formats small numbers correctly', () => {
    setupState()
    const { formatNumber } = useAnalytics()
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(0)).toBe('0')
  })
})

describe('fetchAnalytics', () => {
  it('handles 403 Forbidden correctly', async () => {
    setupState()
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(null, { status: 403 }))

    const { refresh } = useAnalytics()
    await refresh()

    expect(mockStateStore[4]).toBe(true) // isForbidden
    expect(mockStateStore[2]).toBe(false) // isLoading
  })

  it('handles 401 Unauthorized correctly', async () => {
    setupState()
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(null, { status: 401 }))

    const { refresh } = useAnalytics()
    await refresh()

    expect(mockStateStore[3]).toBe('Unauthorized') // error
    expect(mockStateStore[2]).toBe(false) // isLoading
  })

  it('handles failed requests correctly', async () => {
    setupState()
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response(null, { status: 500 }))

    const { refresh } = useAnalytics()
    await refresh()

    expect(mockStateStore[3]).toBe('Failed to fetch analytics') // error
    expect(mockStateStore[2]).toBe(false) // isLoading
  })

  it('handles network errors correctly', async () => {
    setupState()
    vi.mocked(global.fetch).mockRejectedValueOnce(new Error('Network error'))

    const { refresh } = useAnalytics()
    await refresh()

    expect(mockStateStore[3]).toBe('Network error') // error
    expect(mockStateStore[2]).toBe(false) // isLoading
  })

  it('updates state on successful fetch', async () => {
    setupState()
    const mockData = {
      success: true,
      data: {
        today: { date: '2023-10-10' },
        yesterday: { date: '2023-10-09' },
        last7Days: [],
        lifetime: { totalUsers: 100 },
        generatedAt: 1234567890,
        planBreakdown: { free: 50, pro: 50 }
      }
    }

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )

    const { refresh } = useAnalytics()
    await refresh()

    expect(mockStateStore[0]).toEqual({
      today: mockData.data.today,
      yesterday: mockData.data.yesterday,
      last7Days: mockData.data.last7Days,
      lifetime: mockData.data.lifetime,
      generatedAt: mockData.data.generatedAt,
    }) // snapshot
    expect(mockStateStore[1]).toEqual(mockData.data.planBreakdown) // planBreakdown
    expect(mockStateStore[2]).toBe(false) // isLoading
    expect(mockStateStore[3]).toBeNull() // error
    expect(mockStateStore[4]).toBe(false) // isForbidden
  })
})
