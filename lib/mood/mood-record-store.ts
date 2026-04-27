import type { KVStore } from '@/types'
import type { MoodEntry, MoodLabel } from '@/types/mood'

const V2_PREFIX = 'mood:v2'
const LIST_PAGE_LIMIT = 1000
const MOOD_LABELS = new Set<MoodLabel>([
  'joyful',
  'excited',
  'calm',
  'content',
  'neutral',
  'tired',
  'anxious',
  'stressed',
  'sad',
  'overwhelmed',
])

export interface MoodTimelineStateRecord {
  userId: string
  version: number
  lastUpdatedAt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeMoodDate(value: unknown): string {
  const normalized = normalizeString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeMoodScore(value: unknown): MoodEntry['score'] | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10
    ? value as MoodEntry['score']
    : null
}

function normalizeMoodLabel(value: unknown): MoodLabel | null {
  return typeof value === 'string' && MOOD_LABELS.has(value as MoodLabel) ? value as MoodLabel : null
}

function normalizeMoodEntry(value: unknown): MoodEntry | null {
  if (!isRecord(value)) return null
  const date = normalizeMoodDate(value.date)
  const score = normalizeMoodScore(value.score)
  const label = normalizeMoodLabel(value.label)
  const trigger = normalizeString(value.trigger, 60)
  if (!date || score === null || label === null || !trigger) return null
  const sessionId = normalizeString(value.sessionId, 200) || undefined
  return {
    date,
    score,
    label,
    trigger,
    recordedAt: normalizeInteger(value.recordedAt),
    sessionId,
  }
}

function normalizeMoodTimelineStateRecord(value: unknown): MoodTimelineStateRecord | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  if (!userId) return null
  return {
    userId,
    version: Math.max(1, normalizeInteger(value.version, 1)),
    lastUpdatedAt: normalizeInteger(value.lastUpdatedAt),
  }
}

async function putJSON(kv: KVStore, key: string, value: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(value))
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

export function supportsMoodList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
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

export function buildMoodTimelineStateKey(userId: string): string {
  return `${V2_PREFIX}:state:${userId}`
}

export function buildMoodEntryRecordPrefix(userId: string): string {
  return `${V2_PREFIX}:entry:${userId}:`
}

export function buildMoodEntryRecordKey(userId: string, date: string): string {
  return `${buildMoodEntryRecordPrefix(userId)}${date}`
}

export async function getMoodTimelineStateRecord(kv: KVStore, userId: string): Promise<MoodTimelineStateRecord | null> {
  return normalizeMoodTimelineStateRecord(await getJSON<MoodTimelineStateRecord>(kv, buildMoodTimelineStateKey(userId)))
}

export async function saveMoodTimelineStateRecord(
  kv: KVStore,
  state: MoodTimelineStateRecord,
): Promise<MoodTimelineStateRecord> {
  const normalized = normalizeMoodTimelineStateRecord(state)
  if (!normalized) throw new Error('Invalid MoodTimelineStateRecord payload')
  await putJSON(kv, buildMoodTimelineStateKey(normalized.userId), normalized)
  return normalized
}

export async function getMoodEntryRecord(kv: KVStore, userId: string, date: string): Promise<MoodEntry | null> {
  return normalizeMoodEntry(await getJSON<MoodEntry>(kv, buildMoodEntryRecordKey(userId, date)))
}

export async function saveMoodEntryRecord(kv: KVStore, userId: string, entry: MoodEntry): Promise<MoodEntry> {
  const normalized = normalizeMoodEntry(entry)
  if (!normalized) throw new Error('Invalid MoodEntry payload')
  await putJSON(kv, buildMoodEntryRecordKey(userId, normalized.date), normalized)
  return normalized
}

export async function deleteMoodEntryRecord(kv: KVStore, userId: string, date: string): Promise<void> {
  await kv.delete(buildMoodEntryRecordKey(userId, date))
}

export async function listMoodEntryRecords(kv: KVStore, userId: string): Promise<MoodEntry[]> {
  if (!supportsMoodList(kv)) return []
  try {
    const prefix = buildMoodEntryRecordPrefix(userId)
    const keys = await listKeysByPrefix(kv, prefix)
    const entries = await Promise.all(keys.map((key) => getJSON<MoodEntry>(kv, key)))
    return entries
      .map((entry) => normalizeMoodEntry(entry))
      .filter((entry): entry is MoodEntry => entry !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
  } catch {
    return []
  }
}
