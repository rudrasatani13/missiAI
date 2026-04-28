/**
 * Normalization utilities for data records.
 *
 * These helpers ensure that raw values from KV or external sources
 * are coerced into the expected types and formats.
 */

/**
 * Normalizes a value to an integer.
 * Ensures the result is a finite number and at least 0.
 */
export function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

/**
 * Normalizes a value to an integer or null if invalid.
 */
export function normalizeOptionalInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : null
}

/**
 * Normalizes a value to a string with a maximum length.
 * Trims whitespace.
 */
export function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

/**
 * Normalizes a value to a YYYY-MM-DD date string.
 * Returns an empty string if invalid.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function normalizeDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().slice(0, 10)
  return DATE_RE.test(normalized) ? normalized : ''
}
