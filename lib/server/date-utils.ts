// ─── Timezone-Aware Date Utilities ────────────────────────────────────────────
//
// BUGFIX (A3/B1): Multiple features used `new Date().toISOString().slice(0, 10)`
// for "today", which returns the UTC date. For users in IST (UTC+5:30), this
// means midnight–5:30 AM local time shows *yesterday's* date — breaking daily
// briefs, mood entries, rate limits, and streak calculations.
//
// This module provides a timezone-aware alternative that all daily features
// should use instead of raw UTC slicing.

/**
 * Returns today's date string (YYYY-MM-DD) in the given IANA timezone.
 * Falls back to UTC if the timezone is invalid or not provided.
 *
 * Uses `Intl.DateTimeFormat` with the `en-CA` locale, which natively
 * produces YYYY-MM-DD format — no manual string manipulation needed.
 *
 * @param timezone - IANA timezone string (e.g. "Asia/Kolkata", "America/New_York")
 * @returns YYYY-MM-DD date string
 *
 * @example
 * getTodayInTimezone("Asia/Kolkata")  // "2026-04-15" at 1:00 AM IST
 * getTodayInTimezone()                // "2026-04-14" (UTC, which is still Apr 14)
 */
export function getTodayInTimezone(timezone?: string): string {
  if (!timezone) {
    return new Date().toISOString().slice(0, 10)
  }

  try {
    // en-CA locale formats dates as YYYY-MM-DD natively
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    return formatter.format(new Date())
  } catch {
    // BUGFIX (A3): Invalid timezone string — fall back to UTC silently.
    // This handles typos, unsupported zones, and any edge cases gracefully.
    return new Date().toISOString().slice(0, 10)
  }
}

/**
 * Returns "today" in UTC. Equivalent to `new Date().toISOString().slice(0, 10)`.
 * Use this when timezone is explicitly not relevant (e.g. server-internal keys).
 */
export function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}
