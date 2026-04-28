import { normalizeString, normalizeOptionalString, normalizeInteger, normalizeDate, normalizeStringArray } from "@/lib/validation"
import type { KVStore } from '@/types'
import type {
  LibraryStoryCategory,
  SleepSessionHistoryEntry,
  SleepSessionMode,
  SleepStory,
} from '@/types/sleep-sessions'

const V2_PREFIX = 'sleep:v2'
const LIST_PAGE_LIMIT = 1000
const SLEEP_SESSION_MODE_SET = new Set<SleepSessionMode>([
  'personalized_story',
  'custom_story',
  'breathing',
  'library',
])
const LIBRARY_STORY_CATEGORY_SET = new Set<LibraryStoryCategory>([
  'nature',
  'space',
  'ocean',
  'childhood',
  'adventure',
  'meditation',
])

export const SLEEP_LAST_STORY_TTL_SECONDS = 86_400
export const SLEEP_DAILY_QUOTA_TTL_SECONDS = 86_400
export const SLEEP_HISTORY_INDEX_LIMIT = 30

export interface SleepHistoryIndex {
  entryIds: string[]
  updatedAt: number
}

export interface SleepDailyQuotaRecord {
  userId: string
  date: string
  generationCount: number
  ttsCount: number
  updatedAt: number
}

export function buildSleepLastStoryKey(userId: string): string {
  return `${V2_PREFIX}:last-story:${userId}`
}

export function buildSleepHistoryEntryPrefix(userId: string): string {
  return `${V2_PREFIX}:history-entry:${userId}:`
}

export function buildSleepHistoryEntryKey(userId: string, entryId: string): string {
  return `${buildSleepHistoryEntryPrefix(userId)}${entryId}`
}

export function buildSleepHistoryIndexKey(userId: string): string {
  return `${V2_PREFIX}:history-index:${userId}`
}

export function buildSleepDailyQuotaKey(userId: string, date: string): string {
  return `${V2_PREFIX}:quota:${userId}:${date}`
}

export function emptySleepHistoryIndex(): SleepHistoryIndex {
  return {
    entryIds: [],
    updatedAt: 0,
  }
}

export function emptySleepDailyQuota(userId: string, date: string): SleepDailyQuotaRecord {
  return {
    userId: normalizeString(userId, 200),
    date: normalizeDate(date),
    generationCount: 0,
    ttsCount: 0,
    updatedAt: 0,
  }
}

function supportsList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}




function normalizeBoolean(value: unknown): boolean {
  return value === true
}


function normalizeTimestamp(value: unknown): string {
  const normalized = normalizeString(value, 40)
  return normalized && !Number.isNaN(Date.parse(normalized)) ? normalized : ''
}


function dedupeIds(ids: string[], maxItems = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const id of ids) {
    const safe = id.trim()
    if (!safe || seen.has(safe)) continue
    seen.add(safe)
    normalized.push(safe)
    if (normalized.length >= maxItems) break
  }
  return normalized
}

function parseSleepSessionMode(value: unknown): SleepSessionMode | null {
  return typeof value === 'string' && SLEEP_SESSION_MODE_SET.has(value as SleepSessionMode)
    ? value as SleepSessionMode
    : null
}

function parseLibraryStoryCategory(value: unknown): LibraryStoryCategory | null {
  return typeof value === 'string' && LIBRARY_STORY_CATEGORY_SET.has(value as LibraryStoryCategory)
    ? value as LibraryStoryCategory
    : null
}

function normalizeSleepStoryValue(value: unknown): SleepStory | null {
  if (!isRecord(value)) return null
  const id = normalizeString(value.id, 120)
  const mode = parseSleepSessionMode(value.mode)
  const title = normalizeString(value.title, 120)
  const text = normalizeString(value.text, 20_000)
  const generatedAt = normalizeInteger(value.generatedAt)
  if (!id || !mode || !title || !text) return null

  const parsedCategory = value.category === undefined ? undefined : parseLibraryStoryCategory(value.category)
  if (value.category !== undefined && !parsedCategory) return null
  const category: LibraryStoryCategory | undefined = parsedCategory ?? undefined

  return {
    id,
    mode,
    title,
    text,
    estimatedDurationSec: normalizeInteger(value.estimatedDurationSec),
    category,
    contextSummary: normalizeOptionalString(value.contextSummary, 500),
    generatedAt,
  }
}

function normalizeSleepSessionHistoryEntryValue(value: unknown): SleepSessionHistoryEntry | null {
  if (!isRecord(value)) return null
  const id = normalizeString(value.id, 120)
  const date = normalizeTimestamp(value.date)
  const mode = parseSleepSessionMode(value.mode)
  const title = normalizeString(value.title, 120)
  if (!id || !date || !mode || !title) return null
  return {
    id,
    date,
    mode,
    title,
    completed: normalizeBoolean(value.completed),
    durationSec: normalizeInteger(value.durationSec),
  }
}

function normalizeSleepHistoryIndexValue(value: unknown): SleepHistoryIndex | null {
  if (!isRecord(value)) return null
  return {
    entryIds: dedupeIds(
      normalizeStringArray(value.entryIds, SLEEP_HISTORY_INDEX_LIMIT * 4, 120),
      SLEEP_HISTORY_INDEX_LIMIT,
    ),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function normalizeSleepDailyQuotaValue(
  value: unknown,
  userId: string,
  date: string,
): SleepDailyQuotaRecord | null {
  if (!isRecord(value)) return null
  const safeUserId = normalizeString(value.userId, 200) || normalizeString(userId, 200)
  const safeDate = normalizeDate(value.date) || normalizeDate(date)
  if (!safeUserId || !safeDate) return null
  return {
    userId: safeUserId,
    date: safeDate,
    generationCount: normalizeInteger(value.generationCount),
    ttsCount: normalizeInteger(value.ttsCount),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

async function putJSON(kv: KVStore, key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void> {
  await kv.put(key, JSON.stringify(value), options)
}

async function readJSON<T>(kv: KVStore, key: string): Promise<T | null> {
  const raw = await kv.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function listKeysByPrefix(
  kv: KVStore & { list: NonNullable<KVStore['list']> },
  prefix: string,
): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_LIMIT })
    for (const entry of page.keys) {
      keys.push(entry.name)
    }
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
}

function extractHistoryEntryIdFromKey(key: string, prefix: string): string | null {
  if (!key.startsWith(prefix)) return null
  const entryId = key.slice(prefix.length).trim()
  return entryId || null
}

function compareHistoryEntries(a: SleepSessionHistoryEntry, b: SleepSessionHistoryEntry): number {
  if (a.date !== b.date) return b.date.localeCompare(a.date)
  return a.id.localeCompare(b.id)
}

async function listSleepHistoryEntryIdsByPrefix(kv: KVStore, userId: string): Promise<string[]> {
  const safeUserId = normalizeString(userId, 200)
  if (!safeUserId || !supportsList(kv)) return []
  try {
    const prefix = buildSleepHistoryEntryPrefix(safeUserId)
    const keys = await listKeysByPrefix(kv, prefix)
    return dedupeIds(
      keys
        .map((key) => extractHistoryEntryIdFromKey(key, prefix))
        .filter((entryId): entryId is string => entryId !== null),
      SLEEP_HISTORY_INDEX_LIMIT,
    )
  } catch {
    return []
  }
}

export async function getSleepLastStoryRecord(kv: KVStore, userId: string): Promise<SleepStory | null> {
  return normalizeSleepStoryValue(
    await readJSON<SleepStory>(kv, buildSleepLastStoryKey(userId)),
  )
}

export async function putSleepLastStoryRecord(
  kv: KVStore,
  userId: string,
  story: SleepStory,
  options?: { expirationTtl?: number },
): Promise<SleepStory> {
  const normalized = normalizeSleepStoryValue(story)
  if (!normalized) throw new Error('Invalid SleepStory payload')
  await putJSON(kv, buildSleepLastStoryKey(userId), normalized, {
    expirationTtl: options?.expirationTtl ?? SLEEP_LAST_STORY_TTL_SECONDS,
  })
  return normalized
}

export async function deleteSleepLastStoryRecord(kv: KVStore, userId: string): Promise<void> {
  await kv.delete(buildSleepLastStoryKey(userId))
}

export async function getSleepHistoryEntryRecord(
  kv: KVStore,
  userId: string,
  entryId: string,
): Promise<SleepSessionHistoryEntry | null> {
  return normalizeSleepSessionHistoryEntryValue(
    await readJSON<SleepSessionHistoryEntry>(kv, buildSleepHistoryEntryKey(userId, entryId)),
  )
}

export async function putSleepHistoryEntryRecord(
  kv: KVStore,
  userId: string,
  entry: SleepSessionHistoryEntry,
  options?: { expirationTtl?: number },
): Promise<SleepSessionHistoryEntry> {
  const normalized = normalizeSleepSessionHistoryEntryValue(entry)
  if (!normalized) throw new Error('Invalid SleepSessionHistoryEntry payload')
  await putJSON(kv, buildSleepHistoryEntryKey(userId, normalized.id), normalized, options)
  return normalized
}

export async function deleteSleepHistoryEntryRecord(
  kv: KVStore,
  userId: string,
  entryId: string,
): Promise<void> {
  await kv.delete(buildSleepHistoryEntryKey(userId, entryId))
}

export async function getSleepHistoryIndex(kv: KVStore, userId: string): Promise<SleepHistoryIndex> {
  return normalizeSleepHistoryIndexValue(
    await readJSON<SleepHistoryIndex>(kv, buildSleepHistoryIndexKey(userId)),
  ) ?? emptySleepHistoryIndex()
}

export async function saveSleepHistoryIndex(
  kv: KVStore,
  userId: string,
  entryIds: string[],
  options?: { expirationTtl?: number },
): Promise<SleepHistoryIndex> {
  const normalized: SleepHistoryIndex = {
    entryIds: dedupeIds(entryIds, SLEEP_HISTORY_INDEX_LIMIT),
    updatedAt: Date.now(),
  }
  await putJSON(kv, buildSleepHistoryIndexKey(userId), normalized, options)
  return normalized
}

export async function addSleepHistoryIndexEntryId(
  kv: KVStore,
  userId: string,
  entryId: string,
  options?: { expirationTtl?: number },
): Promise<SleepHistoryIndex> {
  const index = await getSleepHistoryIndex(kv, userId)
  return saveSleepHistoryIndex(
    kv,
    userId,
    [entryId, ...index.entryIds.filter((existingId) => existingId !== entryId)],
    options,
  )
}

export async function removeSleepHistoryIndexEntryId(
  kv: KVStore,
  userId: string,
  entryId: string,
  options?: { expirationTtl?: number },
): Promise<SleepHistoryIndex> {
  const index = await getSleepHistoryIndex(kv, userId)
  return saveSleepHistoryIndex(
    kv,
    userId,
    index.entryIds.filter((existingId) => existingId !== entryId),
    options,
  )
}

export async function listSleepHistoryEntryIds(kv: KVStore, userId: string): Promise<string[]> {
  const index = await getSleepHistoryIndex(kv, userId)
  if (index.entryIds.length > 0) return index.entryIds
  return listSleepHistoryEntryIdsByPrefix(kv, userId)
}

export async function listSleepHistoryEntries(
  kv: KVStore,
  userId: string,
  limit = SLEEP_HISTORY_INDEX_LIMIT,
): Promise<SleepSessionHistoryEntry[]> {
  const safeLimit = Math.max(0, Math.floor(limit))
  if (safeLimit === 0) return []

  const index = await getSleepHistoryIndex(kv, userId)
  if (index.entryIds.length > 0) {
    const entries = await Promise.all(
      index.entryIds
        .slice(0, safeLimit)
        .map((entryId) => getSleepHistoryEntryRecord(kv, userId, entryId)),
    )
    return entries.filter((entry): entry is SleepSessionHistoryEntry => entry !== null)
  }

  const entryIds = await listSleepHistoryEntryIdsByPrefix(kv, userId)
  const entries = await Promise.all(
    entryIds.map((entryId) => getSleepHistoryEntryRecord(kv, userId, entryId)),
  )
  return entries
    .filter((entry): entry is SleepSessionHistoryEntry => entry !== null)
    .sort(compareHistoryEntries)
    .slice(0, safeLimit)
}

export async function getSleepDailyQuotaRecord(
  kv: KVStore,
  userId: string,
  date: string,
): Promise<SleepDailyQuotaRecord | null> {
  return normalizeSleepDailyQuotaValue(
    await readJSON<SleepDailyQuotaRecord>(kv, buildSleepDailyQuotaKey(userId, date)),
    userId,
    date,
  )
}

export async function putSleepDailyQuotaRecord(
  kv: KVStore,
  quota: SleepDailyQuotaRecord,
  options?: { expirationTtl?: number },
): Promise<SleepDailyQuotaRecord> {
  const normalized = normalizeSleepDailyQuotaValue(quota, quota.userId, quota.date)
  if (!normalized) throw new Error('Invalid SleepDailyQuotaRecord payload')
  await putJSON(kv, buildSleepDailyQuotaKey(normalized.userId, normalized.date), normalized, {
    expirationTtl: options?.expirationTtl ?? SLEEP_DAILY_QUOTA_TTL_SECONDS,
  })
  return normalized
}

export async function deleteSleepDailyQuotaRecord(kv: KVStore, userId: string, date: string): Promise<void> {
  await kv.delete(buildSleepDailyQuotaKey(userId, date))
}
