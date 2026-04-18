import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getTodayInTimezone, getTodayUTC } from '@/lib/server/date-utils'

describe('date-utils', () => {
  describe('getTodayUTC', () => {
    it('returns a YYYY-MM-DD formatted string representing today in UTC', () => {
      // Mocking the Date object to a fixed time
      const mockDate = new Date('2023-10-15T12:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      expect(getTodayUTC()).toBe('2023-10-15')

      vi.useRealTimers()
    })

    it('handles leap years correctly', () => {
      const mockDate = new Date('2024-02-29T12:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      expect(getTodayUTC()).toBe('2024-02-29')

      vi.useRealTimers()
    })
  })

  describe('getTodayInTimezone', () => {
    it('returns a YYYY-MM-DD formatted string for a given timezone', () => {
      // Set to a time where the date differs between UTC and the target timezone
      // 2023-10-15 23:00 UTC is 2023-10-16 04:30 in Asia/Kolkata
      const mockDate = new Date('2023-10-15T23:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      expect(getTodayInTimezone('Asia/Kolkata')).toBe('2023-10-16')

      vi.useRealTimers()
    })

    it('falls back to UTC if timezone is not provided', () => {
      const mockDate = new Date('2023-10-15T12:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      expect(getTodayInTimezone()).toBe('2023-10-15')

      vi.useRealTimers()
    })

    it('falls back to UTC if timezone is invalid', () => {
      const mockDate = new Date('2023-10-15T12:00:00Z')
      vi.useFakeTimers()
      vi.setSystemTime(mockDate)

      // Assuming Invalid/Timezone is invalid
      expect(getTodayInTimezone('Invalid/Timezone')).toBe('2023-10-15')

      vi.useRealTimers()
    })
  })
})
