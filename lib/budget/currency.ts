// ─── Budget Buddy Currency Utilities ────────────────────────────────────────

/** Currency allowlist — prevents invalid / unsupported currency codes */
export const VALID_CURRENCIES = new Set<string>([
  'USD', 'EUR', 'GBP', 'INR', 'JPY',
  'CAD', 'AUD', 'SGD', 'CHF', 'CNY',
])

/** ISO 4217 → symbol mapping */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  INR: '₹',
  JPY: '¥',
  CAD: 'C$',
  AUD: 'A$',
  SGD: 'S$',
  CHF: 'Fr',
  CNY: '¥',
}

/**
 * Normalize and validate a currency code.
 * Returns the uppercase code if valid, otherwise returns null.
 */
export function validateCurrency(raw: string): string | null {
  const code = String(raw).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5)
  if (!code || !VALID_CURRENCIES.has(code)) return null
  return code
}

/**
 * Get the display symbol for a currency code.
 * Falls back to the code itself if unknown.
 */
export function currencySymbol(code: string): string {
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? code.toUpperCase()
}

/**
 * Format a monetary amount with the appropriate locale and symbol.
 * Always uses English locale for consistent display.
 */
export function formatMoney(
  amount: number,
  currency: string,
  options?: { locale?: string; fractionDigits?: number }
): string {
  const locale = options?.locale ?? 'en-US'
  const digits = options?.fractionDigits ?? 2
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount)
  } catch {
    // Invalid currency for Intl — fallback to symbol + amount
    const sym = currencySymbol(currency)
    return `${sym}${amount.toFixed(digits)}`
  }
}

/** Default currency for new users */
export const DEFAULT_CURRENCY = 'USD'
