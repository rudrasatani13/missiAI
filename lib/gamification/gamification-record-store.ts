import type { KVStore } from '@/types'
import type {
  Achievement,
  GamificationData,
  GamificationGrantRecord,
  GamificationStateRecord,
  HabitStreak,
  XPLogEntry,
  XPSource,
} from '@/types/gamification'

const V2_PREFIX = 'gamification:v2'
const LIST_PAGE_LIMIT = 1000
const XP_SOURCE_SET = new Set<XPSource>([
  'checkin',
  'milestone',
  'chat',
  'memory',
  'agent',
  'login',
  'achievement',
  'budget',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeDate(value: unknown): string {
  const normalized = normalizeString(value, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : ''
}

function normalizeXPSource(value: unknown): XPSource | null {
  return typeof value === 'string' && XP_SOURCE_SET.has(value as XPSource) ? value as XPSource : null
}

function normalizeXPLogEntry(value: unknown): XPLogEntry | null {
  if (!isRecord(value)) return null
  const source = normalizeXPSource(value.source)
  if (source === null) return null
  return {
    source,
    amount: normalizeInteger(value.amount),
    timestamp: normalizeInteger(value.timestamp),
  }
}

function normalizeXPLogEntries(value: unknown): XPLogEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .map((entry) => normalizeXPLogEntry(entry))
    .filter((entry): entry is XPLogEntry => entry !== null)
}

function normalizeHabitStreak(value: unknown): HabitStreak | null {
  if (!isRecord(value)) return null
  const nodeId = normalizeString(value.nodeId, 200)
  if (!nodeId) return null
  return {
    nodeId,
    title: normalizeString(value.title, 200),
    currentStreak: normalizeInteger(value.currentStreak),
    longestStreak: normalizeInteger(value.longestStreak),
    lastCheckedIn: normalizeDate(value.lastCheckedIn),
    totalCheckIns: normalizeInteger(value.totalCheckIns),
  }
}

function normalizeAchievement(value: unknown): Achievement | null {
  if (!isRecord(value)) return null
  const id = normalizeString(value.id, 120)
  const title = normalizeString(value.title, 160)
  const description = normalizeString(value.description, 300)
  if (!id || !title || !description) return null
  return {
    id,
    title,
    description,
    xpBonus: normalizeInteger(value.xpBonus),
    unlockedAt: value.unlockedAt === null ? null : normalizeInteger(value.unlockedAt),
  }
}

function normalizeGamificationStateRecord(value: unknown): GamificationStateRecord | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  if (!userId) return null
  return {
    userId,
    totalXPBaseline: normalizeInteger(value.totalXPBaseline),
    loginStreak: normalizeInteger(value.loginStreak),
    lastLoginDate: normalizeDate(value.lastLoginDate),
    legacyTodayXPLogDate: normalizeDate(value.legacyTodayXPLogDate),
    legacyTodayXPLog: normalizeXPLogEntries(value.legacyTodayXPLog),
    lastUpdatedAt: normalizeInteger(value.lastUpdatedAt),
  }
}

function normalizeGamificationGrantRecord(value: unknown): GamificationGrantRecord | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  const date = normalizeDate(value.date)
  const source = normalizeXPSource(value.source)
  if (!userId || !date || source === null) return null
  return {
    userId,
    date,
    source,
    amount: normalizeInteger(value.amount),
    timestamp: normalizeInteger(value.timestamp),
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

export function supportsGamificationList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
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

export function buildGamificationStateRecordKey(userId: string): string {
  return `${V2_PREFIX}:state:${userId}`
}

export function buildHabitRecordPrefix(userId: string): string {
  return `${V2_PREFIX}:habit:${userId}:`
}

export function buildHabitRecordKey(userId: string, nodeId: string): string {
  return `${buildHabitRecordPrefix(userId)}${encodeURIComponent(nodeId)}`
}

export function buildAchievementRecordPrefix(userId: string): string {
  return `${V2_PREFIX}:achievement:${userId}:`
}

export function buildAchievementRecordKey(userId: string, achievementId: string): string {
  return `${buildAchievementRecordPrefix(userId)}${encodeURIComponent(achievementId)}`
}

export function buildGrantRecordPrefix(userId: string): string {
  return `${V2_PREFIX}:grant:${userId}:`
}

export function buildGrantRecordKey(userId: string, date: string, scope: string): string {
  return `${buildGrantRecordPrefix(userId)}${date}:${scope}`
}

export function defaultGamificationStateRecord(userId: string): GamificationStateRecord {
  return {
    userId,
    totalXPBaseline: 0,
    loginStreak: 0,
    lastLoginDate: '',
    legacyTodayXPLogDate: '',
    legacyTodayXPLog: [],
    lastUpdatedAt: 0,
  }
}

export async function getGamificationStateRecord(kv: KVStore, userId: string): Promise<GamificationStateRecord | null> {
  return normalizeGamificationStateRecord(await getJSON<GamificationStateRecord>(kv, buildGamificationStateRecordKey(userId)))
}

export async function saveGamificationStateRecord(
  kv: KVStore,
  state: GamificationStateRecord,
): Promise<GamificationStateRecord> {
  const normalized = normalizeGamificationStateRecord(state)
  if (!normalized) throw new Error('Invalid GamificationStateRecord payload')
  await putJSON(kv, buildGamificationStateRecordKey(normalized.userId), normalized)
  return normalized
}

export async function getHabitRecord(kv: KVStore, userId: string, nodeId: string): Promise<HabitStreak | null> {
  return normalizeHabitStreak(await getJSON<HabitStreak>(kv, buildHabitRecordKey(userId, nodeId)))
}

export async function saveHabitRecord(kv: KVStore, userId: string, habit: HabitStreak): Promise<HabitStreak> {
  const normalized = normalizeHabitStreak(habit)
  if (!normalized) throw new Error('Invalid HabitStreak payload')
  await putJSON(kv, buildHabitRecordKey(userId, normalized.nodeId), normalized)
  return normalized
}

export async function deleteHabitRecord(kv: KVStore, userId: string, nodeId: string): Promise<void> {
  await kv.delete(buildHabitRecordKey(userId, nodeId))
}

export async function listHabitRecords(kv: KVStore, userId: string): Promise<HabitStreak[]> {
  if (!supportsGamificationList(kv)) return []
  try {
    const prefix = buildHabitRecordPrefix(userId)
    const keys = await listKeysByPrefix(kv, prefix)
    const habits = await Promise.all(keys.map((key) => getJSON<HabitStreak>(kv, key)))
    return habits
      .map((habit) => normalizeHabitStreak(habit))
      .filter((habit): habit is HabitStreak => habit !== null)
      .sort((a, b) => a.nodeId.localeCompare(b.nodeId))
  } catch {
    return []
  }
}

export async function getAchievementRecord(kv: KVStore, userId: string, achievementId: string): Promise<Achievement | null> {
  return normalizeAchievement(await getJSON<Achievement>(kv, buildAchievementRecordKey(userId, achievementId)))
}

export async function saveAchievementRecord(kv: KVStore, userId: string, achievement: Achievement): Promise<Achievement> {
  const normalized = normalizeAchievement(achievement)
  if (!normalized) throw new Error('Invalid Achievement payload')
  await putJSON(kv, buildAchievementRecordKey(userId, normalized.id), normalized)
  return normalized
}

export async function deleteAchievementRecord(kv: KVStore, userId: string, achievementId: string): Promise<void> {
  await kv.delete(buildAchievementRecordKey(userId, achievementId))
}

export async function listAchievementRecords(kv: KVStore, userId: string): Promise<Achievement[]> {
  if (!supportsGamificationList(kv)) return []
  try {
    const prefix = buildAchievementRecordPrefix(userId)
    const keys = await listKeysByPrefix(kv, prefix)
    const achievements = await Promise.all(keys.map((key) => getJSON<Achievement>(kv, key)))
    return achievements
      .map((achievement) => normalizeAchievement(achievement))
      .filter((achievement): achievement is Achievement => achievement !== null)
      .sort((a, b) => a.id.localeCompare(b.id))
  } catch {
    return []
  }
}

export async function getGrantRecord(kv: KVStore, key: string): Promise<GamificationGrantRecord | null> {
  return normalizeGamificationGrantRecord(await getJSON<GamificationGrantRecord>(kv, key))
}

export async function saveGrantRecord(
  kv: KVStore,
  grant: GamificationGrantRecord,
  scope: string,
): Promise<GamificationGrantRecord> {
  const normalized = normalizeGamificationGrantRecord(grant)
  if (!normalized) throw new Error('Invalid GamificationGrantRecord payload')
  await putJSON(kv, buildGrantRecordKey(normalized.userId, normalized.date, scope), normalized)
  return normalized
}

export async function listGrantRecords(kv: KVStore, userId: string): Promise<GamificationGrantRecord[]> {
  if (!supportsGamificationList(kv)) return []
  try {
    const prefix = buildGrantRecordPrefix(userId)
    const keys = await listKeysByPrefix(kv, prefix)
    const grants = await Promise.all(keys.map((key) => getJSON<GamificationGrantRecord>(kv, key)))
    return grants
      .map((grant) => normalizeGamificationGrantRecord(grant))
      .filter((grant): grant is GamificationGrantRecord => grant !== null)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date)
        if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
        if (a.source !== b.source) return a.source.localeCompare(b.source)
        return 0
      })
  } catch {
    return []
  }
}

export function buildGamificationDataFromRecords(
  state: GamificationStateRecord,
  habits: HabitStreak[],
  achievements: Achievement[],
  grants: GamificationGrantRecord[],
  today: string,
): GamificationData {
  const todayLegacyXPLog = state.legacyTodayXPLogDate === today ? state.legacyTodayXPLog : []
  const todayGrants = grants
    .filter((grant) => grant.date === today)
    .map<XPLogEntry>((grant) => ({ source: grant.source, amount: grant.amount, timestamp: grant.timestamp }))
  const totalXP = state.totalXPBaseline + grants.reduce((sum, grant) => sum + grant.amount, 0)
  return {
    userId: state.userId,
    totalXP,
    level: 1,
    avatarTier: 1,
    habits,
    achievements,
    xpLog: [...todayLegacyXPLog, ...todayGrants].sort((a, b) => a.timestamp - b.timestamp),
    xpLogDate: today,
    loginStreak: state.loginStreak,
    lastLoginDate: state.lastLoginDate,
    lastUpdatedAt: state.lastUpdatedAt,
  }
}
