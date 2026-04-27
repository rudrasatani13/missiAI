import type { KVStore } from '@/types'
import { DEFAULT_CURRENCY } from './currency'
import { VALID_EXPENSE_CATEGORIES } from '@/types/budget'
import type {
  BudgetSettings,
  BudgetTab,
  ExpenseCategory,
  ExpenseEntry,
  SpendingInsight,
} from '@/types/budget'

const V2_PREFIX = 'budget:v2'
const LIST_PAGE_LIMIT = 1000
const BUDGET_TAB_SET = new Set<BudgetTab>(['overview', 'entries', 'budgets', 'insights', 'settings'])
const EXPENSE_CATEGORY_SET = new Set<ExpenseCategory>(VALID_EXPENSE_CATEGORIES)
const ENTRY_SOURCE_SET = new Set<ExpenseEntry['source']>(['manual', 'agent'])

export const BUDGET_ENTRY_TTL_SECONDS = 395 * 86_400
export const BUDGET_INSIGHT_TTL_SECONDS = 395 * 86_400

export interface BudgetMonthLink {
  userId: string
  yearMonth: string
  entryId: string
  date: string
  createdAt: number
  updatedAt: number
}

export interface BudgetMonthIndex {
  entryIds: string[]
  updatedAt: number
}

export interface BudgetRecentIndex {
  entryIds: string[]
  updatedAt: number
}

export function buildBudgetSettingsRecordKey(userId: string): string {
  return `${V2_PREFIX}:settings:${userId}`
}

export function buildBudgetEntryRecordPrefix(userId: string): string {
  return `${V2_PREFIX}:entry:${userId}:`
}

export function buildBudgetEntryRecordKey(userId: string, entryId: string): string {
  return `${buildBudgetEntryRecordPrefix(userId)}${entryId}`
}

export function buildBudgetMonthLinkPrefix(userId: string, yearMonth: string): string {
  return `${V2_PREFIX}:month-link:${userId}:${yearMonth}:`
}

export function buildBudgetMonthLinkKey(userId: string, yearMonth: string, entryId: string): string {
  return `${buildBudgetMonthLinkPrefix(userId, yearMonth)}${entryId}`
}

export function buildBudgetMonthIndexKey(userId: string, yearMonth: string): string {
  return `${V2_PREFIX}:month-index:${userId}:${yearMonth}`
}

export function buildBudgetRecentIndexKey(userId: string): string {
  return `${V2_PREFIX}:recent-index:${userId}`
}

export function buildBudgetInsightRecordKey(userId: string, yearMonth: string): string {
  return `${V2_PREFIX}:insight:${userId}:${yearMonth}`
}

export function getYearMonthFromDate(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null
}

function supportsList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeOptionalString(value: unknown, maxLength: number): string | undefined {
  const normalized = normalizeString(value, maxLength)
  return normalized || undefined
}

function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function normalizeCurrency(value: unknown): string {
  const normalized = normalizeString(value, 5).toUpperCase()
  return normalized || DEFAULT_CURRENCY
}

function normalizeDate(value: unknown): string {
  const normalized = normalizeString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeYearMonth(value: unknown): string {
  const normalized = normalizeString(value, 7)
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const item of value) {
    const safe = normalizeString(item, maxLength)
    if (!safe || seen.has(safe)) continue
    seen.add(safe)
    normalized.push(safe)
    if (normalized.length >= maxItems) break
  }
  return normalized
}

function dedupeIds(ids: string[]): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const id of ids) {
    const safe = id.trim()
    if (!safe || seen.has(safe)) continue
    seen.add(safe)
    normalized.push(safe)
  }
  return normalized
}

function normalizeBudgetTab(value: unknown): BudgetTab {
  return typeof value === 'string' && BUDGET_TAB_SET.has(value as BudgetTab) ? value as BudgetTab : 'overview'
}

function normalizeExpenseCategory(value: unknown): ExpenseCategory {
  return typeof value === 'string' && EXPENSE_CATEGORY_SET.has(value as ExpenseCategory)
    ? value as ExpenseCategory
    : 'other'
}

function normalizeExpenseSource(value: unknown): ExpenseEntry['source'] {
  return typeof value === 'string' && ENTRY_SOURCE_SET.has(value as ExpenseEntry['source'])
    ? value as ExpenseEntry['source']
    : 'manual'
}

function normalizeBudgetSettingsRecord(value: unknown): BudgetSettings | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  if (!userId) return null
  const limits = Array.isArray(value.limits)
    ? value.limits
      .map((limit) => {
        if (!isRecord(limit)) return null
        return {
          category: normalizeExpenseCategory(limit.category),
          amount: normalizeNumber(limit.amount),
          currency: normalizeCurrency(limit.currency),
        }
      })
      .filter((limit): limit is BudgetSettings['limits'][number] => limit !== null && limit.amount > 0)
    : []
  return {
    userId,
    preferredCurrency: normalizeCurrency(value.preferredCurrency),
    defaultView: normalizeBudgetTab(value.defaultView),
    limits,
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeExpenseEntryRecord(value: unknown): ExpenseEntry | null {
  if (!isRecord(value)) return null
  const id = normalizeString(value.id, 120)
  const userId = normalizeString(value.userId, 200)
  const date = normalizeDate(value.date)
  if (!id || !userId || !date) return null
  return {
    id,
    userId,
    amount: normalizeNumber(value.amount),
    currency: normalizeCurrency(value.currency),
    category: normalizeExpenseCategory(value.category),
    description: normalizeString(value.description, 200),
    date,
    createdAt: normalizeInteger(value.createdAt),
    updatedAt: normalizeInteger(value.updatedAt),
    source: normalizeExpenseSource(value.source),
    note: normalizeOptionalString(value.note, 500),
  }
}

function normalizeBudgetMonthLinkRecord(value: unknown): BudgetMonthLink | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  const entryId = normalizeString(value.entryId, 120)
  const date = normalizeDate(value.date)
  const normalizedYearMonth = normalizeYearMonth(value.yearMonth) || getYearMonthFromDate(date) || ''
  if (!userId || !entryId || !date || !normalizedYearMonth) return null
  return {
    userId,
    yearMonth: normalizedYearMonth,
    entryId,
    date,
    createdAt: normalizeInteger(value.createdAt),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeBudgetMonthIndexRecord(value: unknown): BudgetMonthIndex | null {
  if (!isRecord(value)) return null
  return {
    entryIds: dedupeIds(normalizeStringArray(value.entryIds, 5000, 120)),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeBudgetRecentIndexRecord(value: unknown): BudgetRecentIndex | null {
  if (!isRecord(value)) return null
  return {
    entryIds: dedupeIds(normalizeStringArray(value.entryIds, 5000, 120)),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeSpendingInsightRecord(value: unknown): SpendingInsight | null {
  if (!isRecord(value)) return null
  const month = normalizeYearMonth(value.month)
  if (!month) return null
  return {
    month,
    currency: normalizeCurrency(value.currency),
    generatedAt: normalizeInteger(value.generatedAt),
    summary: normalizeString(value.summary, 2000),
    topCategory: value.topCategory === null ? null : normalizeExpenseCategory(value.topCategory),
    topCategoryAmount: normalizeNumber(value.topCategoryAmount),
    comparisonText: typeof value.comparisonText === 'string' ? normalizeString(value.comparisonText, 200) : null,
    suggestions: normalizeStringArray(value.suggestions, 8, 240),
    aiGenerated: Boolean(value.aiGenerated),
  }
}

async function putJSON(kv: KVStore, key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void> {
  await kv.put(key, JSON.stringify(value), options)
}

async function getJSON<T>(kv: KVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function listKeysByPrefix(kv: KVStore & { list: NonNullable<KVStore['list']> }, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_LIMIT })
    for (const entry of page.keys) keys.push(entry.name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
}

function compareMonthLinks(a: BudgetMonthLink, b: BudgetMonthLink): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date)
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt
  return a.entryId.localeCompare(b.entryId)
}

function compareEntriesByMonth(a: ExpenseEntry, b: ExpenseEntry): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date)
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt
  return a.id.localeCompare(b.id)
}

function compareEntriesByRecent(a: ExpenseEntry, b: ExpenseEntry): number {
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt
  if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt
  return a.id.localeCompare(b.id)
}

async function listBudgetMonthEntryIdsByPrefixOrIndex(
  kv: KVStore,
  userId: string,
  yearMonth: string,
): Promise<string[]> {
  const safeUserId = normalizeString(userId, 200)
  const safeYearMonth = normalizeYearMonth(yearMonth)
  if (!safeUserId || !safeYearMonth) return []
  if (supportsList(kv)) {
    try {
      const prefix = buildBudgetMonthLinkPrefix(safeUserId, safeYearMonth)
      const keys = await listKeysByPrefix(kv, prefix)
      const ids = dedupeIds(keys.map((key) => key.slice(prefix.length)).filter(Boolean))
      if (ids.length > 0) return ids
    } catch {
    }
  }
  return (await getBudgetMonthIndex(kv, safeUserId, safeYearMonth)).entryIds
}

async function listBudgetEntryIdsByPrefix(kv: KVStore, userId: string): Promise<string[]> {
  const safeUserId = normalizeString(userId, 200)
  if (!safeUserId || !supportsList(kv)) return []
  try {
    const prefix = buildBudgetEntryRecordPrefix(safeUserId)
    const keys = await listKeysByPrefix(kv, prefix)
    return dedupeIds(keys.map((key) => key.slice(prefix.length)).filter(Boolean))
  } catch {
    return []
  }
}

export function buildBudgetMonthLinkRecord(entry: ExpenseEntry): BudgetMonthLink | null {
  const normalizedEntry = normalizeExpenseEntryRecord(entry)
  if (!normalizedEntry) return null
  const yearMonth = getYearMonthFromDate(normalizedEntry.date)
  if (!yearMonth) return null
  return {
    userId: normalizedEntry.userId,
    yearMonth,
    entryId: normalizedEntry.id,
    date: normalizedEntry.date,
    createdAt: normalizedEntry.createdAt,
    updatedAt: normalizedEntry.updatedAt,
  }
}

export async function getBudgetSettingsRecord(kv: KVStore, userId: string): Promise<BudgetSettings | null> {
  return normalizeBudgetSettingsRecord(await getJSON<BudgetSettings>(kv, buildBudgetSettingsRecordKey(userId)))
}

export async function saveBudgetSettingsRecord(kv: KVStore, settings: BudgetSettings): Promise<BudgetSettings> {
  const normalized = normalizeBudgetSettingsRecord(settings)
  if (!normalized) throw new Error('Invalid BudgetSettings payload')
  await putJSON(kv, buildBudgetSettingsRecordKey(normalized.userId), normalized)
  return normalized
}

export async function deleteBudgetSettingsRecord(kv: KVStore, userId: string): Promise<void> {
  await kv.delete(buildBudgetSettingsRecordKey(userId))
}

export async function getBudgetEntryRecord(kv: KVStore, userId: string, entryId: string): Promise<ExpenseEntry | null> {
  return normalizeExpenseEntryRecord(await getJSON<ExpenseEntry>(kv, buildBudgetEntryRecordKey(userId, entryId)))
}

export async function putBudgetEntryRecord(
  kv: KVStore,
  entry: ExpenseEntry,
  options?: { expirationTtl?: number },
): Promise<ExpenseEntry> {
  const normalized = normalizeExpenseEntryRecord(entry)
  if (!normalized) throw new Error('Invalid ExpenseEntry payload')
  await putJSON(kv, buildBudgetEntryRecordKey(normalized.userId, normalized.id), normalized, {
    expirationTtl: options?.expirationTtl ?? BUDGET_ENTRY_TTL_SECONDS,
  })
  return normalized
}

export async function deleteBudgetEntryRecord(kv: KVStore, userId: string, entryId: string): Promise<void> {
  await kv.delete(buildBudgetEntryRecordKey(userId, entryId))
}

export async function getBudgetMonthLink(
  kv: KVStore,
  userId: string,
  yearMonth: string,
  entryId: string,
): Promise<BudgetMonthLink | null> {
  return normalizeBudgetMonthLinkRecord(
    await getJSON<BudgetMonthLink>(kv, buildBudgetMonthLinkKey(userId, yearMonth, entryId)),
  )
}

export async function putBudgetMonthLink(
  kv: KVStore,
  link: BudgetMonthLink,
  options?: { expirationTtl?: number },
): Promise<BudgetMonthLink> {
  const normalized = normalizeBudgetMonthLinkRecord(link)
  if (!normalized) throw new Error('Invalid BudgetMonthLink payload')
  await putJSON(
    kv,
    buildBudgetMonthLinkKey(normalized.userId, normalized.yearMonth, normalized.entryId),
    normalized,
    { expirationTtl: options?.expirationTtl ?? BUDGET_ENTRY_TTL_SECONDS },
  )
  await addBudgetMonthIndexEntryId(kv, normalized.userId, normalized.yearMonth, normalized.entryId, options)
  return normalized
}

export async function deleteBudgetMonthLink(
  kv: KVStore,
  userId: string,
  yearMonth: string,
  entryId: string,
): Promise<void> {
  await kv.delete(buildBudgetMonthLinkKey(userId, yearMonth, entryId))
  await removeBudgetMonthIndexEntryId(kv, userId, yearMonth, entryId)
}

export async function getBudgetMonthIndex(kv: KVStore, userId: string, yearMonth: string): Promise<BudgetMonthIndex> {
  return normalizeBudgetMonthIndexRecord(
    await getJSON<BudgetMonthIndex>(kv, buildBudgetMonthIndexKey(userId, yearMonth)),
  ) ?? { entryIds: [], updatedAt: 0 }
}

export async function saveBudgetMonthIndex(
  kv: KVStore,
  userId: string,
  yearMonth: string,
  entryIds: string[],
  options?: { expirationTtl?: number },
): Promise<BudgetMonthIndex> {
  const normalized: BudgetMonthIndex = {
    entryIds: dedupeIds(entryIds),
    updatedAt: Date.now(),
  }
  await putJSON(kv, buildBudgetMonthIndexKey(userId, yearMonth), normalized, {
    expirationTtl: options?.expirationTtl ?? BUDGET_ENTRY_TTL_SECONDS,
  })
  return normalized
}

export async function addBudgetMonthIndexEntryId(
  kv: KVStore,
  userId: string,
  yearMonth: string,
  entryId: string,
  options?: { expirationTtl?: number },
): Promise<BudgetMonthIndex> {
  const index = await getBudgetMonthIndex(kv, userId, yearMonth)
  return saveBudgetMonthIndex(kv, userId, yearMonth, [...index.entryIds, entryId], options)
}

export async function removeBudgetMonthIndexEntryId(
  kv: KVStore,
  userId: string,
  yearMonth: string,
  entryId: string,
): Promise<BudgetMonthIndex> {
  const index = await getBudgetMonthIndex(kv, userId, yearMonth)
  return saveBudgetMonthIndex(
    kv,
    userId,
    yearMonth,
    index.entryIds.filter((existing) => existing !== entryId),
  )
}

export async function listBudgetMonthEntryIds(kv: KVStore, userId: string, yearMonth: string): Promise<string[]> {
  return listBudgetMonthEntryIdsByPrefixOrIndex(kv, userId, yearMonth)
}

export async function listBudgetMonthLinks(kv: KVStore, userId: string, yearMonth: string): Promise<BudgetMonthLink[]> {
  const entryIds = await listBudgetMonthEntryIdsByPrefixOrIndex(kv, userId, yearMonth)
  const links = await Promise.all(entryIds.map((entryId) => getBudgetMonthLink(kv, userId, yearMonth, entryId)))
  return links
    .filter((link): link is BudgetMonthLink => link !== null && link.yearMonth === yearMonth)
    .sort(compareMonthLinks)
}

export async function getBudgetRecentIndex(kv: KVStore, userId: string): Promise<BudgetRecentIndex> {
  return normalizeBudgetRecentIndexRecord(
    await getJSON<BudgetRecentIndex>(kv, buildBudgetRecentIndexKey(userId)),
  ) ?? { entryIds: [], updatedAt: 0 }
}

export async function saveBudgetRecentIndex(
  kv: KVStore,
  userId: string,
  entryIds: string[],
  options?: { expirationTtl?: number },
): Promise<BudgetRecentIndex> {
  const normalized: BudgetRecentIndex = {
    entryIds: dedupeIds(entryIds),
    updatedAt: Date.now(),
  }
  await putJSON(kv, buildBudgetRecentIndexKey(userId), normalized, {
    expirationTtl: options?.expirationTtl ?? BUDGET_ENTRY_TTL_SECONDS,
  })
  return normalized
}

export async function addBudgetRecentIndexEntryId(
  kv: KVStore,
  userId: string,
  entryId: string,
  options?: { expirationTtl?: number; toFront?: boolean; maxItems?: number },
): Promise<BudgetRecentIndex> {
  const index = await getBudgetRecentIndex(kv, userId)
  const withoutCurrent = index.entryIds.filter((existing) => existing !== entryId)
  const nextIds = options?.toFront === false ? [...withoutCurrent, entryId] : [entryId, ...withoutCurrent]
  const limitedIds = typeof options?.maxItems === 'number' ? nextIds.slice(0, options.maxItems) : nextIds
  return saveBudgetRecentIndex(kv, userId, limitedIds, options)
}

export async function removeBudgetRecentIndexEntryId(
  kv: KVStore,
  userId: string,
  entryId: string,
): Promise<BudgetRecentIndex> {
  const index = await getBudgetRecentIndex(kv, userId)
  return saveBudgetRecentIndex(kv, userId, index.entryIds.filter((existing) => existing !== entryId))
}

export async function getBudgetInsightRecord(kv: KVStore, userId: string, yearMonth: string): Promise<SpendingInsight | null> {
  return normalizeSpendingInsightRecord(
    await getJSON<SpendingInsight>(kv, buildBudgetInsightRecordKey(userId, yearMonth)),
  )
}

export async function putBudgetInsightRecord(
  kv: KVStore,
  userId: string,
  insight: SpendingInsight,
  options?: { expirationTtl?: number },
): Promise<SpendingInsight> {
  const normalized = normalizeSpendingInsightRecord(insight)
  if (!normalized) throw new Error('Invalid SpendingInsight payload')
  await putJSON(kv, buildBudgetInsightRecordKey(userId, normalized.month), normalized, {
    expirationTtl: options?.expirationTtl ?? BUDGET_INSIGHT_TTL_SECONDS,
  })
  return normalized
}

export async function deleteBudgetInsightRecord(kv: KVStore, userId: string, yearMonth: string): Promise<void> {
  await kv.delete(buildBudgetInsightRecordKey(userId, yearMonth))
}

export async function hydrateBudgetEntriesByIds(
  kv: KVStore,
  userId: string,
  entryIds: string[],
): Promise<ExpenseEntry[]> {
  const uniqueIds = dedupeIds(entryIds)
  const entries = await Promise.all(uniqueIds.map((entryId) => getBudgetEntryRecord(kv, userId, entryId)))
  return entries.filter((entry): entry is ExpenseEntry => entry !== null)
}

export async function buildBudgetMonthSnapshot(
  kv: KVStore,
  userId: string,
  yearMonth: string,
): Promise<ExpenseEntry[]> {
  const links = await listBudgetMonthLinks(kv, userId, yearMonth)
  const entries = await Promise.all(links.map((link) => getBudgetEntryRecord(kv, userId, link.entryId)))
  return entries
    .filter((entry): entry is ExpenseEntry => entry !== null && entry.date.slice(0, 7) === yearMonth)
    .sort(compareEntriesByMonth)
}

export async function buildBudgetRecentEntriesSnapshot(
  kv: KVStore,
  userId: string,
  count = 10,
): Promise<ExpenseEntry[]> {
  const recentIndex = await getBudgetRecentIndex(kv, userId)
  if (recentIndex.entryIds.length > 0) {
    const entries = await hydrateBudgetEntriesByIds(kv, userId, recentIndex.entryIds)
    return entries.sort(compareEntriesByRecent).slice(0, count)
  }
  const entryIds = await listBudgetEntryIdsByPrefix(kv, userId)
  if (entryIds.length === 0) return []
  const entries = await hydrateBudgetEntriesByIds(kv, userId, entryIds)
  return entries.sort(compareEntriesByRecent).slice(0, count)
}
