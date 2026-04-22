import { describe, it, expect } from 'vitest'
import {
  validateCurrency,
  currencySymbol,
  formatMoney,
  DEFAULT_CURRENCY,
} from '@/lib/budget/currency'

describe('currency utilities', () => {
  it('validateCurrency accepts valid codes', () => {
    expect(validateCurrency('usd')).toBe('USD')
    expect(validateCurrency('INR')).toBe('INR')
    expect(validateCurrency('jpy')).toBe('JPY')
  })

  it('validateCurrency rejects invalid codes', () => {
    expect(validateCurrency('xyz')).toBeNull()
    expect(validateCurrency('')).toBeNull()
    expect(validateCurrency('us')).toBeNull()
  })

  it('currencySymbol returns correct symbols', () => {
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol('INR')).toBe('₹')
    expect(currencySymbol('GBP')).toBe('£')
    expect(currencySymbol('XYZ')).toBe('XYZ')
  })

  it('formatMoney formats with locale', () => {
    expect(formatMoney(1234.5, 'USD')).toContain('$')
    expect(formatMoney(1234.5, 'INR')).toContain('₹')
    expect(formatMoney(0, 'EUR')).toContain('€')
  })

  it('formatMoney falls back on invalid currency', () => {
    const result = formatMoney(100, 'XYZ')
    expect(result).toContain('XYZ')
    expect(result).toContain('100.00')
  })

  it('default currency is USD', () => {
    expect(DEFAULT_CURRENCY).toBe('USD')
  })
})
