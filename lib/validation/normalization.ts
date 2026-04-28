export function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

export function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  const normalized = normalizeString(value, maxLength)
  return normalized === '' ? undefined : normalized
}

export function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

export function normalizeOptionalInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : undefined
}

export function normalizeDate(value: unknown): string {
  const normalized = normalizeString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

export function normalizeStringArray(value: unknown, maxItems?: number, maxLength: number = 200): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const item of value) {
    const safe = normalizeString(item, maxLength)
    if (!safe || seen.has(safe)) continue
    seen.add(safe)
    normalized.push(safe)
    if (maxItems !== undefined && normalized.length >= maxItems) break
  }
  return normalized
}
