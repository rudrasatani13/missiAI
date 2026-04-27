import type { KVStore } from '@/types'
import type { PlanId } from '@/types/billing'
import type { AnalyticsSnapshot, DailyStats, LifetimeTotals } from '@/types/analytics'
import { emptyDailyStats, emptyLifetimeTotals } from '@/types/analytics'

const V2_PREFIX = 'analytics:v2'
const LIST_PAGE_LIMIT = 1000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ANALYTICS_EVENT_TYPE_SET = new Set<AnalyticsEventRecordType>([
  'chat',
  'tts',
  'memory_read',
  'memory_write',
  'action',
  'error',
  'signup',
  'seen',
])

export const ANALYTICS_USER_DAY_TTL_SECONDS = 90 * 86_400
export const ANALYTICS_DAY_SUMMARY_TTL_SECONDS = 90 * 86_400
export const ANALYTICS_SNAPSHOT_TTL_SECONDS = 300

export interface AnalyticsUserDayRecord {
  userId: string
  date: string
  totalRequests: number
  uniqueUsers: number
  voiceInteractions: number
  chatRequests: number
  ttsRequests: number
  memoryReads: number
  memoryWrites: number
  actionsExecuted: number
  totalCostUsd: number
  errorCount: number
  newSignups: number
  seenToday: boolean
  updatedAt: number
}

export interface AnalyticsUserLifetimeRecord {
  userId: string
  totalInteractions: number
  totalCostUsd: number
  totalSignups: number
  countsTowardTotalUsers: boolean
  firstSeenAt: number
  lastSeenAt: number
  updatedAt: number
}

export interface AnalyticsMeta {
  cutoverDate: string | null
  legacyLifetimeBaseline: LifetimeTotals
  migratedAt: number | null
  updatedAt: number
}

export interface AnalyticsDayIndex {
  userIds: string[]
  updatedAt: number
}

export interface AnalyticsUserIndex {
  userIds: string[]
  updatedAt: number
}

export type AnalyticsEventRecordType =
  | 'chat'
  | 'tts'
  | 'memory_read'
  | 'memory_write'
  | 'action'
  | 'error'
  | 'signup'
  | 'seen'

export interface AnalyticsEventRecord {
  eventId: string
  userId: string
  date: string
  type: AnalyticsEventRecordType
  costUsd: number
  markSeen: boolean
  metadata: Record<string, unknown>
  createdAt: number
}

export interface AnalyticsEventDayIndex {
  eventKeys: string[]
  updatedAt: number
}

export interface AnalyticsEventDateIndex {
  dates: string[]
  updatedAt: number
}

export interface AnalyticsAggregationState {
  pendingEventKeys: string[]
  pendingDates: string[]
  totalAppendedEvents: number
  totalProcessedEvents: number
  lastAppendedAt: number
  lastProcessedAt: number
  updatedAt: number
}

export interface AnalyticsLifetimeBuildOptions {
  legacyBaseline?: LifetimeTotals | null
  totalRevenue?: number
  planBreakdown?: Partial<Record<PlanId, number>>
}

export function buildAnalyticsUserDayRecordPrefix(userId?: string): string {
  return userId ? `${V2_PREFIX}:user-day:${userId}:` : `${V2_PREFIX}:user-day:`
}

export function buildAnalyticsUserDayRecordKey(userId: string, date: string): string {
  return `${buildAnalyticsUserDayRecordPrefix(userId)}${date}`
}

export function buildAnalyticsUserLifetimeRecordPrefix(): string {
  return `${V2_PREFIX}:user-lifetime:`
}

export function buildAnalyticsUserLifetimeRecordKey(userId: string): string {
  return `${buildAnalyticsUserLifetimeRecordPrefix()}${userId}`
}

export function buildAnalyticsMetaKey(): string {
  return `${V2_PREFIX}:meta`
}

export function buildAnalyticsDaySummaryKey(date: string): string {
  return `${V2_PREFIX}:day-summary:${date}`
}

export function buildAnalyticsSnapshotKey(): string {
  return `${V2_PREFIX}:snapshot`
}

export function buildAnalyticsDayIndexKey(date: string): string {
  return `${V2_PREFIX}:day-index:${date}`
}

export function buildAnalyticsUserIndexKey(): string {
  return `${V2_PREFIX}:user-index`
}

export function buildAnalyticsEventRecordPrefix(date?: string): string {
  return date ? `${V2_PREFIX}:event:${date}:` : `${V2_PREFIX}:event:`
}

export function buildAnalyticsEventRecordKey(date: string, eventId: string): string {
  return `${buildAnalyticsEventRecordPrefix(date)}${eventId}`
}

export function buildAnalyticsEventDayIndexKey(date: string): string {
  return `${V2_PREFIX}:event-day-index:${date}`
}

export function buildAnalyticsEventDateIndexKey(): string {
  return `${V2_PREFIX}:event-date-index`
}

export function buildAnalyticsAggregationStateKey(): string {
  return `${V2_PREFIX}:aggregation-state`
}

export function emptyAnalyticsUserDayRecord(userId: string, date: string): AnalyticsUserDayRecord {
  return {
    userId,
    date,
    totalRequests: 0,
    uniqueUsers: 0,
    voiceInteractions: 0,
    chatRequests: 0,
    ttsRequests: 0,
    memoryReads: 0,
    memoryWrites: 0,
    actionsExecuted: 0,
    totalCostUsd: 0,
    errorCount: 0,
    newSignups: 0,
    seenToday: false,
    updatedAt: Date.now(),
  }
}

export function emptyAnalyticsUserLifetimeRecord(userId: string): AnalyticsUserLifetimeRecord {
  return {
    userId,
    totalInteractions: 0,
    totalCostUsd: 0,
    totalSignups: 0,
    countsTowardTotalUsers: false,
    firstSeenAt: 0,
    lastSeenAt: 0,
    updatedAt: Date.now(),
  }
}

export function emptyAnalyticsMeta(): AnalyticsMeta {
  return {
    cutoverDate: null,
    legacyLifetimeBaseline: emptyLifetimeTotals(),
    migratedAt: null,
    updatedAt: Date.now(),
  }
}

export function emptyAnalyticsAggregationState(): AnalyticsAggregationState {
  return {
    pendingEventKeys: [],
    pendingDates: [],
    totalAppendedEvents: 0,
    totalProcessedEvents: 0,
    lastAppendedAt: 0,
    lastProcessedAt: 0,
    updatedAt: Date.now(),
  }
}

function supportsList(kv: KVStore): kv is KVStore & { list: NonNullable<KVStore['list']> } {
  return typeof kv.list === 'function'
}

async function listKeysByPrefix(
  kv: KVStore & { list: NonNullable<KVStore['list']> },
  prefix: string,
): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await kv.list({ prefix, cursor, limit: LIST_PAGE_LIMIT })
    for (const entry of page.keys) keys.push(entry.name)
    cursor = page.list_complete ? undefined : page.cursor
  } while (cursor)
  return keys
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeString(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeDate(value: unknown): string {
  const normalized = normalizeString(value, 10)
  return DATE_RE.test(normalized) ? normalized : ''
}

function normalizeInteger(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
}

function normalizeNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : fallback
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeStringList(value: unknown, maxLength: number): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const entry of value) {
    const item = normalizeString(entry, maxLength)
    if (!item || seen.has(item)) continue
    seen.add(item)
    normalized.push(item)
  }
  return normalized
}

function normalizeUserIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const entry of value) {
    const userId = normalizeString(entry, 200)
    if (!userId || seen.has(userId)) continue
    seen.add(userId)
    normalized.push(userId)
  }
  return normalized
}

function normalizePlanBreakdown(value: unknown): Record<PlanId, number> {
  const record = isRecord(value) ? value : {}
  return {
    free: normalizeInteger(record.free),
    plus: normalizeInteger(record.plus),
    pro: normalizeInteger(record.pro),
  }
}

function normalizeDates(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const normalized: string[] = []
  for (const entry of value) {
    const date = normalizeDate(entry)
    if (!date || seen.has(date)) continue
    seen.add(date)
    normalized.push(date)
  }
  return normalized
}

function coerceAnalyticsEventType(value: unknown): AnalyticsEventRecordType {
  return typeof value === 'string' && ANALYTICS_EVENT_TYPE_SET.has(value as AnalyticsEventRecordType)
    ? value as AnalyticsEventRecordType
    : 'seen'
}

function parseDailyStats(value: unknown, expectedDate?: string): DailyStats | null {
  if (!isRecord(value)) return null
  const date = normalizeDate(value.date)
  if (!date || (expectedDate && date !== expectedDate)) return null
  return {
    date,
    totalRequests: normalizeInteger(value.totalRequests),
    uniqueUsers: normalizeInteger(value.uniqueUsers),
    voiceInteractions: normalizeInteger(value.voiceInteractions),
    chatRequests: normalizeInteger(value.chatRequests),
    ttsRequests: normalizeInteger(value.ttsRequests),
    memoryReads: normalizeInteger(value.memoryReads),
    memoryWrites: normalizeInteger(value.memoryWrites),
    actionsExecuted: normalizeInteger(value.actionsExecuted),
    totalCostUsd: normalizeNumber(value.totalCostUsd),
    errorCount: normalizeInteger(value.errorCount),
    newSignups: normalizeInteger(value.newSignups),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseLifetimeTotals(value: unknown): LifetimeTotals | null {
  if (!isRecord(value)) return null
  return {
    totalUsers: normalizeInteger(value.totalUsers),
    totalInteractions: normalizeInteger(value.totalInteractions),
    totalCostUsd: normalizeNumber(value.totalCostUsd),
    totalRevenue: normalizeNumber(value.totalRevenue),
    planBreakdown: normalizePlanBreakdown(value.planBreakdown),
    lastUpdatedAt: normalizeInteger(value.lastUpdatedAt),
  }
}

function parseAnalyticsUserDayRecord(
  value: unknown,
  expectedUserId?: string,
  expectedDate?: string,
): AnalyticsUserDayRecord | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  const date = normalizeDate(value.date)
  if (!userId || !date) return null
  if ((expectedUserId && userId !== expectedUserId) || (expectedDate && date !== expectedDate)) return null
  return {
    userId,
    date,
    totalRequests: normalizeInteger(value.totalRequests),
    uniqueUsers: normalizeInteger(value.uniqueUsers),
    voiceInteractions: normalizeInteger(value.voiceInteractions),
    chatRequests: normalizeInteger(value.chatRequests),
    ttsRequests: normalizeInteger(value.ttsRequests),
    memoryReads: normalizeInteger(value.memoryReads),
    memoryWrites: normalizeInteger(value.memoryWrites),
    actionsExecuted: normalizeInteger(value.actionsExecuted),
    totalCostUsd: normalizeNumber(value.totalCostUsd),
    errorCount: normalizeInteger(value.errorCount),
    newSignups: normalizeInteger(value.newSignups),
    seenToday: normalizeBoolean(value.seenToday),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseAnalyticsUserLifetimeRecord(
  value: unknown,
  expectedUserId?: string,
): AnalyticsUserLifetimeRecord | null {
  if (!isRecord(value)) return null
  const userId = normalizeString(value.userId, 200)
  if (!userId || (expectedUserId && userId !== expectedUserId)) return null
  return {
    userId,
    totalInteractions: normalizeInteger(value.totalInteractions),
    totalCostUsd: normalizeNumber(value.totalCostUsd),
    totalSignups: normalizeInteger(value.totalSignups),
    countsTowardTotalUsers: normalizeBoolean(value.countsTowardTotalUsers),
    firstSeenAt: normalizeInteger(value.firstSeenAt),
    lastSeenAt: normalizeInteger(value.lastSeenAt),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseAnalyticsMeta(value: unknown): AnalyticsMeta | null {
  if (!isRecord(value)) return null
  const cutoverDate = value.cutoverDate === null ? null : normalizeDate(value.cutoverDate)
  if (value.cutoverDate !== null && !cutoverDate) return null
  return {
    cutoverDate,
    legacyLifetimeBaseline: parseLifetimeTotals(value.legacyLifetimeBaseline) ?? emptyLifetimeTotals(),
    migratedAt: value.migratedAt === null ? null : normalizeInteger(value.migratedAt),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseAnalyticsSnapshot(value: unknown): AnalyticsSnapshot | null {
  if (!isRecord(value)) return null
  const today = parseDailyStats(value.today)
  const yesterday = parseDailyStats(value.yesterday)
  const lifetime = parseLifetimeTotals(value.lifetime)
  if (!today || !yesterday || !lifetime || !Array.isArray(value.last7Days)) return null
  const last7Days = value.last7Days
    .map((entry) => parseDailyStats(entry))
    .filter((entry): entry is DailyStats => entry !== null)
  return {
    today,
    yesterday,
    last7Days,
    lifetime,
    generatedAt: normalizeInteger(value.generatedAt),
  }
}

function parseAnalyticsDayIndex(value: unknown): AnalyticsDayIndex | null {
  if (!isRecord(value)) return null
  return {
    userIds: normalizeUserIds(value.userIds),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseAnalyticsUserIndex(value: unknown): AnalyticsUserIndex | null {
  if (!isRecord(value)) return null
  return {
    userIds: normalizeUserIds(value.userIds),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseAnalyticsEventRecord(
  value: unknown,
  expectedEventId?: string,
  expectedDate?: string,
): AnalyticsEventRecord | null {
  if (!isRecord(value)) return null
  const eventId = normalizeString(value.eventId, 120)
  const userId = normalizeString(value.userId, 200)
  const date = normalizeDate(value.date)
  if (!eventId || !userId || !date) return null
  if ((expectedEventId && eventId !== expectedEventId) || (expectedDate && date !== expectedDate)) return null
  return {
    eventId,
    userId,
    date,
    type: coerceAnalyticsEventType(value.type),
    costUsd: normalizeNumber(value.costUsd),
    markSeen: normalizeBoolean(value.markSeen),
    metadata: isRecord(value.metadata) ? value.metadata : {},
    createdAt: normalizeInteger(value.createdAt),
  }
}

function parseAnalyticsEventDayIndex(value: unknown): AnalyticsEventDayIndex | null {
  if (!isRecord(value)) return null
  return {
    eventKeys: normalizeStringList(value.eventKeys, 300),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseAnalyticsEventDateIndex(value: unknown): AnalyticsEventDateIndex | null {
  if (!isRecord(value)) return null
  return {
    dates: normalizeDates(value.dates),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function parseAnalyticsAggregationState(value: unknown): AnalyticsAggregationState | null {
  if (!isRecord(value)) return null
  return {
    pendingEventKeys: normalizeStringList(value.pendingEventKeys, 300),
    pendingDates: normalizeDates(value.pendingDates),
    totalAppendedEvents: normalizeInteger(value.totalAppendedEvents),
    totalProcessedEvents: normalizeInteger(value.totalProcessedEvents),
    lastAppendedAt: normalizeInteger(value.lastAppendedAt),
    lastProcessedAt: normalizeInteger(value.lastProcessedAt),
    updatedAt: normalizeInteger(value.updatedAt),
  }
}

function requireAnalyticsUserDayRecord(record: AnalyticsUserDayRecord): AnalyticsUserDayRecord {
  const normalized = parseAnalyticsUserDayRecord(record)
  if (!normalized) throw new Error('Invalid analytics user-day record')
  return normalized
}

function requireAnalyticsUserLifetimeRecord(record: AnalyticsUserLifetimeRecord): AnalyticsUserLifetimeRecord {
  const normalized = parseAnalyticsUserLifetimeRecord(record)
  if (!normalized) throw new Error('Invalid analytics user-lifetime record')
  return normalized
}

function requireAnalyticsMeta(record: AnalyticsMeta): AnalyticsMeta {
  const normalized = parseAnalyticsMeta(record)
  if (!normalized) throw new Error('Invalid analytics meta record')
  return normalized
}

function requireDailyStats(record: DailyStats): DailyStats {
  const normalized = parseDailyStats(record)
  if (!normalized) throw new Error('Invalid analytics daily stats record')
  return normalized
}

function requireAnalyticsSnapshot(record: AnalyticsSnapshot): AnalyticsSnapshot {
  const normalized = parseAnalyticsSnapshot(record)
  if (!normalized) throw new Error('Invalid analytics snapshot record')
  return normalized
}

function requireAnalyticsEventRecord(record: AnalyticsEventRecord): AnalyticsEventRecord {
  const normalized = parseAnalyticsEventRecord(record)
  if (!normalized) throw new Error('Invalid analytics event record')
  return normalized
}

function requireAnalyticsEventDayIndex(record: AnalyticsEventDayIndex): AnalyticsEventDayIndex {
  const normalized = parseAnalyticsEventDayIndex(record)
  if (!normalized) throw new Error('Invalid analytics event day index')
  return normalized
}

function requireAnalyticsEventDateIndex(record: AnalyticsEventDateIndex): AnalyticsEventDateIndex {
  const normalized = parseAnalyticsEventDateIndex(record)
  if (!normalized) throw new Error('Invalid analytics event date index')
  return normalized
}

function requireAnalyticsAggregationState(record: AnalyticsAggregationState): AnalyticsAggregationState {
  const normalized = parseAnalyticsAggregationState(record)
  if (!normalized) throw new Error('Invalid analytics aggregation state')
  return normalized
}

function applyAnalyticsEventCounters(
  target: Pick<DailyStats, 'totalRequests' | 'voiceInteractions' | 'chatRequests' | 'ttsRequests' | 'memoryReads' | 'memoryWrites' | 'actionsExecuted' | 'errorCount' | 'newSignups'>,
  type: AnalyticsEventRecordType,
): void {
  if (type === 'seen') return

  target.totalRequests += 1

  switch (type) {
    case 'chat':
      target.chatRequests += 1
      target.voiceInteractions += 1
      break
    case 'tts':
      target.ttsRequests += 1
      break
    case 'memory_read':
      target.memoryReads += 1
      break
    case 'memory_write':
      target.memoryWrites += 1
      break
    case 'action':
      target.actionsExecuted += 1
      break
    case 'error':
      target.errorCount += 1
      break
    case 'signup':
      target.newSignups += 1
      break
  }
}

export function parseAnalyticsEventRecordKey(key: string): { date: string; eventId: string } | null {
  const prefix = buildAnalyticsEventRecordPrefix()
  if (!key.startsWith(prefix)) return null
  const remainder = key.slice(prefix.length)
  const separatorIndex = remainder.indexOf(':')
  if (separatorIndex === -1) return null
  const date = normalizeDate(remainder.slice(0, separatorIndex))
  const eventId = normalizeString(remainder.slice(separatorIndex + 1), 120)
  if (!date || !eventId) return null
  return { date, eventId }
}

async function readJsonValue(kv: KVStore, key: string): Promise<unknown | null> {
  const raw = await kv.get(key)
  return raw ? JSON.parse(raw) : null
}

export async function getAnalyticsUserDayRecord(
  kv: KVStore,
  userId: string,
  date: string,
): Promise<AnalyticsUserDayRecord | null> {
  try {
    return parseAnalyticsUserDayRecord(await readJsonValue(kv, buildAnalyticsUserDayRecordKey(userId, date)), userId, date)
  } catch {
    return null
  }
}

export async function putAnalyticsUserDayRecord(
  kv: KVStore,
  record: AnalyticsUserDayRecord,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsUserDayRecord(record)
  await kv.put(
    buildAnalyticsUserDayRecordKey(normalized.userId, normalized.date),
    JSON.stringify(normalized),
    { expirationTtl: options?.expirationTtl ?? ANALYTICS_USER_DAY_TTL_SECONDS },
  )
}

export async function getAnalyticsUserLifetimeRecord(
  kv: KVStore,
  userId: string,
): Promise<AnalyticsUserLifetimeRecord | null> {
  try {
    return parseAnalyticsUserLifetimeRecord(await readJsonValue(kv, buildAnalyticsUserLifetimeRecordKey(userId)), userId)
  } catch {
    return null
  }
}

export async function putAnalyticsUserLifetimeRecord(
  kv: KVStore,
  record: AnalyticsUserLifetimeRecord,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsUserLifetimeRecord(record)
  await kv.put(
    buildAnalyticsUserLifetimeRecordKey(normalized.userId),
    JSON.stringify(normalized),
    options,
  )
}

export async function getAnalyticsMeta(kv: KVStore): Promise<AnalyticsMeta | null> {
  try {
    return parseAnalyticsMeta(await readJsonValue(kv, buildAnalyticsMetaKey()))
  } catch {
    return null
  }
}

export async function putAnalyticsMeta(
  kv: KVStore,
  meta: AnalyticsMeta,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsMeta(meta)
  await kv.put(buildAnalyticsMetaKey(), JSON.stringify(normalized), options)
}

export async function getAnalyticsDaySummary(kv: KVStore, date: string): Promise<DailyStats | null> {
  try {
    return parseDailyStats(await readJsonValue(kv, buildAnalyticsDaySummaryKey(date)), date)
  } catch {
    return null
  }
}

export async function putAnalyticsDaySummary(
  kv: KVStore,
  stats: DailyStats,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireDailyStats(stats)
  await kv.put(
    buildAnalyticsDaySummaryKey(normalized.date),
    JSON.stringify(normalized),
    { expirationTtl: options?.expirationTtl ?? ANALYTICS_DAY_SUMMARY_TTL_SECONDS },
  )
}

export async function deleteAnalyticsDaySummary(kv: KVStore, date: string): Promise<void> {
  await kv.delete(buildAnalyticsDaySummaryKey(date))
}

export async function getAnalyticsSnapshotCache(kv: KVStore): Promise<AnalyticsSnapshot | null> {
  try {
    return parseAnalyticsSnapshot(await readJsonValue(kv, buildAnalyticsSnapshotKey()))
  } catch {
    return null
  }
}

export async function putAnalyticsSnapshotCache(
  kv: KVStore,
  snapshot: AnalyticsSnapshot,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsSnapshot(snapshot)
  await kv.put(
    buildAnalyticsSnapshotKey(),
    JSON.stringify(normalized),
    { expirationTtl: options?.expirationTtl ?? ANALYTICS_SNAPSHOT_TTL_SECONDS },
  )
}

export async function deleteAnalyticsSnapshotCache(kv: KVStore): Promise<void> {
  await kv.delete(buildAnalyticsSnapshotKey())
}

export async function getAnalyticsEventRecord(
  kv: KVStore,
  date: string,
  eventId: string,
): Promise<AnalyticsEventRecord | null> {
  try {
    return parseAnalyticsEventRecord(
      await readJsonValue(kv, buildAnalyticsEventRecordKey(date, eventId)),
      eventId,
      date,
    )
  } catch {
    return null
  }
}

export async function getAnalyticsEventRecordByKey(
  kv: KVStore,
  key: string,
): Promise<AnalyticsEventRecord | null> {
  const parsedKey = parseAnalyticsEventRecordKey(key)
  if (!parsedKey) return null
  try {
    return parseAnalyticsEventRecord(
      await readJsonValue(kv, key),
      parsedKey.eventId,
      parsedKey.date,
    )
  } catch {
    return null
  }
}

export async function putAnalyticsEventRecord(
  kv: KVStore,
  record: AnalyticsEventRecord,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsEventRecord(record)
  await kv.put(
    buildAnalyticsEventRecordKey(normalized.date, normalized.eventId),
    JSON.stringify(normalized),
    options,
  )
}

export async function getAnalyticsEventDayIndex(kv: KVStore, date: string): Promise<AnalyticsEventDayIndex> {
  try {
    return parseAnalyticsEventDayIndex(await readJsonValue(kv, buildAnalyticsEventDayIndexKey(date))) ?? { eventKeys: [], updatedAt: 0 }
  } catch {
    return { eventKeys: [], updatedAt: 0 }
  }
}

export async function putAnalyticsEventDayIndex(
  kv: KVStore,
  date: string,
  index: AnalyticsEventDayIndex,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsEventDayIndex(index)
  await kv.put(buildAnalyticsEventDayIndexKey(date), JSON.stringify(normalized), options)
}

export async function addAnalyticsEventKeyForDate(
  kv: KVStore,
  date: string,
  eventKey: string,
): Promise<void> {
  const normalizedEventKey = normalizeString(eventKey, 300)
  if (!normalizedEventKey || !DATE_RE.test(date)) return
  const existing = await getAnalyticsEventDayIndex(kv, date)
  if (existing.eventKeys.includes(normalizedEventKey)) return
  await putAnalyticsEventDayIndex(kv, date, {
    eventKeys: [...existing.eventKeys, normalizedEventKey],
    updatedAt: Date.now(),
  })
}

export async function getAnalyticsEventDateIndex(kv: KVStore): Promise<AnalyticsEventDateIndex> {
  try {
    return parseAnalyticsEventDateIndex(await readJsonValue(kv, buildAnalyticsEventDateIndexKey())) ?? { dates: [], updatedAt: 0 }
  } catch {
    return { dates: [], updatedAt: 0 }
  }
}

export async function putAnalyticsEventDateIndex(
  kv: KVStore,
  index: AnalyticsEventDateIndex,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsEventDateIndex(index)
  await kv.put(buildAnalyticsEventDateIndexKey(), JSON.stringify(normalized), options)
}

export async function addAnalyticsEventDate(kv: KVStore, date: string): Promise<void> {
  if (!DATE_RE.test(date)) return
  const existing = await getAnalyticsEventDateIndex(kv)
  if (existing.dates.includes(date)) return
  await putAnalyticsEventDateIndex(kv, {
    dates: [...existing.dates, date].sort(),
    updatedAt: Date.now(),
  })
}

export async function appendAnalyticsEventRecord(
  kv: KVStore,
  record: AnalyticsEventRecord,
  options?: { expirationTtl?: number },
): Promise<string> {
  const normalized = requireAnalyticsEventRecord(record)
  const key = buildAnalyticsEventRecordKey(normalized.date, normalized.eventId)
  await putAnalyticsEventRecord(kv, normalized, options)
  await addAnalyticsEventKeyForDate(kv, normalized.date, key)
  await addAnalyticsEventDate(kv, normalized.date)
  return key
}

export async function getAnalyticsAggregationState(kv: KVStore): Promise<AnalyticsAggregationState> {
  try {
    return parseAnalyticsAggregationState(await readJsonValue(kv, buildAnalyticsAggregationStateKey())) ?? emptyAnalyticsAggregationState()
  } catch {
    return emptyAnalyticsAggregationState()
  }
}

export async function putAnalyticsAggregationState(
  kv: KVStore,
  state: AnalyticsAggregationState,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = requireAnalyticsAggregationState(state)
  await kv.put(buildAnalyticsAggregationStateKey(), JSON.stringify(normalized), options)
}

export async function enqueueAnalyticsPendingEvent(
  kv: KVStore,
  eventKey: string,
  date: string,
  appendedAt = Date.now(),
): Promise<void> {
  const normalizedEventKey = normalizeString(eventKey, 300)
  const normalizedDate = normalizeDate(date)
  if (!normalizedEventKey || !normalizedDate) return
  const existing = await getAnalyticsAggregationState(kv)
  const alreadyQueued = existing.pendingEventKeys.includes(normalizedEventKey)
  const pendingDates = existing.pendingDates.includes(normalizedDate)
    ? existing.pendingDates
    : [...existing.pendingDates, normalizedDate].sort()

  await putAnalyticsAggregationState(kv, {
    pendingEventKeys: alreadyQueued
      ? existing.pendingEventKeys
      : [...existing.pendingEventKeys, normalizedEventKey],
    pendingDates,
    totalAppendedEvents: alreadyQueued
      ? existing.totalAppendedEvents
      : existing.totalAppendedEvents + 1,
    totalProcessedEvents: existing.totalProcessedEvents,
    lastAppendedAt: Math.max(existing.lastAppendedAt, appendedAt),
    lastProcessedAt: existing.lastProcessedAt,
    updatedAt: Date.now(),
  })
}

export async function markAnalyticsPendingEventsProcessed(
  kv: KVStore,
  processedEventKeys: string[],
  processedAt = Date.now(),
): Promise<void> {
  if (processedEventKeys.length === 0) return
  const existing = await getAnalyticsAggregationState(kv)
  const processedSet = new Set(normalizeStringList(processedEventKeys, 300))
  if (processedSet.size === 0) return
  const remainingKeys = existing.pendingEventKeys.filter((key) => !processedSet.has(key))
  const remainingDates = [...new Set(
    remainingKeys
      .map((key) => parseAnalyticsEventRecordKey(key)?.date ?? '')
      .filter((date): date is string => Boolean(date)),
  )].sort()

  await putAnalyticsAggregationState(kv, {
    pendingEventKeys: remainingKeys,
    pendingDates: remainingDates,
    totalAppendedEvents: existing.totalAppendedEvents,
    totalProcessedEvents: existing.totalProcessedEvents + processedSet.size,
    lastAppendedAt: existing.lastAppendedAt,
    lastProcessedAt: processedAt,
    updatedAt: Date.now(),
  })
}

export async function getAnalyticsDayIndex(kv: KVStore, date: string): Promise<AnalyticsDayIndex> {
  try {
    return parseAnalyticsDayIndex(await readJsonValue(kv, buildAnalyticsDayIndexKey(date))) ?? { userIds: [], updatedAt: 0 }
  } catch {
    return { userIds: [], updatedAt: 0 }
  }
}

export async function putAnalyticsDayIndex(
  kv: KVStore,
  date: string,
  index: AnalyticsDayIndex,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = parseAnalyticsDayIndex(index) ?? { userIds: [], updatedAt: Date.now() }
  await kv.put(
    buildAnalyticsDayIndexKey(date),
    JSON.stringify(normalized),
    { expirationTtl: options?.expirationTtl ?? ANALYTICS_USER_DAY_TTL_SECONDS },
  )
}

export async function addAnalyticsDayIndexUserId(kv: KVStore, date: string, userId: string): Promise<void> {
  const normalizedUserId = normalizeString(userId, 200)
  if (!normalizedUserId || !DATE_RE.test(date)) return
  const existing = await getAnalyticsDayIndex(kv, date)
  if (existing.userIds.includes(normalizedUserId)) return
  await putAnalyticsDayIndex(kv, date, {
    userIds: [...existing.userIds, normalizedUserId],
    updatedAt: Date.now(),
  })
}

export async function removeAnalyticsDayIndexUserId(kv: KVStore, date: string, userId: string): Promise<void> {
  const normalizedUserId = normalizeString(userId, 200)
  if (!normalizedUserId || !DATE_RE.test(date)) return
  const existing = await getAnalyticsDayIndex(kv, date)
  await putAnalyticsDayIndex(kv, date, {
    userIds: existing.userIds.filter((existingUserId) => existingUserId !== normalizedUserId),
    updatedAt: Date.now(),
  })
}

export async function getAnalyticsUserIndex(kv: KVStore): Promise<AnalyticsUserIndex> {
  try {
    return parseAnalyticsUserIndex(await readJsonValue(kv, buildAnalyticsUserIndexKey())) ?? { userIds: [], updatedAt: 0 }
  } catch {
    return { userIds: [], updatedAt: 0 }
  }
}

export async function putAnalyticsUserIndex(
  kv: KVStore,
  index: AnalyticsUserIndex,
  options?: { expirationTtl?: number },
): Promise<void> {
  const normalized = parseAnalyticsUserIndex(index) ?? { userIds: [], updatedAt: Date.now() }
  await kv.put(buildAnalyticsUserIndexKey(), JSON.stringify(normalized), options)
}

export async function addAnalyticsUserIndexUserId(kv: KVStore, userId: string): Promise<void> {
  const normalizedUserId = normalizeString(userId, 200)
  if (!normalizedUserId) return
  const existing = await getAnalyticsUserIndex(kv)
  if (existing.userIds.includes(normalizedUserId)) return
  await putAnalyticsUserIndex(kv, {
    userIds: [...existing.userIds, normalizedUserId],
    updatedAt: Date.now(),
  })
}

export async function listAnalyticsUserIds(kv: KVStore): Promise<string[]> {
  const indexed = await getAnalyticsUserIndex(kv)
  if (indexed.userIds.length > 0) return indexed.userIds
  if (!supportsList(kv)) return []
  const prefix = buildAnalyticsUserLifetimeRecordPrefix()
  const keys = await listKeysByPrefix(kv, prefix)
  return normalizeUserIds(keys.map((key) => key.slice(prefix.length)))
}

export async function listAnalyticsDayUserIds(kv: KVStore, date: string): Promise<string[]> {
  const indexed = await getAnalyticsDayIndex(kv, date)
  if (indexed.userIds.length > 0) return indexed.userIds
  if (!supportsList(kv)) return []
  const prefix = buildAnalyticsUserDayRecordPrefix()
  const suffix = `:${date}`
  const keys = await listKeysByPrefix(kv, prefix)
  return normalizeUserIds(
    keys
      .filter((key) => key.endsWith(suffix))
      .map((key) => key.slice(prefix.length, key.length - suffix.length)),
  )
}

export async function listAnalyticsEventDates(kv: KVStore): Promise<string[]> {
  const indexed = await getAnalyticsEventDateIndex(kv)
  if (indexed.dates.length > 0) return indexed.dates
  if (!supportsList(kv)) return []
  const prefix = buildAnalyticsEventRecordPrefix()
  const keys = await listKeysByPrefix(kv, prefix)
  return normalizeDates(
    keys
      .map((key) => parseAnalyticsEventRecordKey(key)?.date ?? '')
      .filter((date): date is string => Boolean(date)),
  )
}

export async function listAnalyticsEventKeysForDate(kv: KVStore, date: string): Promise<string[]> {
  const indexed = await getAnalyticsEventDayIndex(kv, date)
  if (indexed.eventKeys.length > 0) return indexed.eventKeys
  if (!supportsList(kv)) return []
  return listKeysByPrefix(kv, buildAnalyticsEventRecordPrefix(date))
}

export async function listAnalyticsEventRecordsForDate(
  kv: KVStore,
  date: string,
): Promise<AnalyticsEventRecord[]> {
  const eventKeys = await listAnalyticsEventKeysForDate(kv, date)
  const records = await Promise.all(eventKeys.map((eventKey) => getAnalyticsEventRecordByKey(kv, eventKey)))
  return records.filter((record): record is AnalyticsEventRecord => record !== null)
}

export async function listAllAnalyticsEventRecords(kv: KVStore): Promise<AnalyticsEventRecord[]> {
  const dates = await listAnalyticsEventDates(kv)
  const recordsByDate = await Promise.all(dates.map((date) => listAnalyticsEventRecordsForDate(kv, date)))
  return recordsByDate.flat().sort((a, b) => a.createdAt - b.createdAt || a.eventId.localeCompare(b.eventId))
}

export async function listAnalyticsUserDayRecordsForDate(
  kv: KVStore,
  date: string,
): Promise<AnalyticsUserDayRecord[]> {
  const userIds = await listAnalyticsDayUserIds(kv, date)
  const records = await Promise.all(userIds.map((userId) => getAnalyticsUserDayRecord(kv, userId, date)))
  return records.filter((record): record is AnalyticsUserDayRecord => record !== null)
}

export async function listAnalyticsUserLifetimeRecords(kv: KVStore): Promise<AnalyticsUserLifetimeRecord[]> {
  const userIds = await listAnalyticsUserIds(kv)
  const records = await Promise.all(userIds.map((userId) => getAnalyticsUserLifetimeRecord(kv, userId)))
  return records.filter((record): record is AnalyticsUserLifetimeRecord => record !== null)
}

export function buildAnalyticsDailyStatsFromUserDayRecords(
  date: string,
  records: AnalyticsUserDayRecord[],
): DailyStats {
  if (!DATE_RE.test(date) || records.length === 0) return emptyDailyStats(date)
  const aggregated = emptyDailyStats(date)
  aggregated.updatedAt = 0
  const seenUsers = new Set<string>()
  for (const record of records) {
    if (record.date !== date) continue
    aggregated.totalRequests += record.totalRequests
    aggregated.voiceInteractions += record.voiceInteractions
    aggregated.chatRequests += record.chatRequests
    aggregated.ttsRequests += record.ttsRequests
    aggregated.memoryReads += record.memoryReads
    aggregated.memoryWrites += record.memoryWrites
    aggregated.actionsExecuted += record.actionsExecuted
    aggregated.totalCostUsd += record.totalCostUsd
    aggregated.errorCount += record.errorCount
    aggregated.newSignups += record.newSignups
    aggregated.updatedAt = Math.max(aggregated.updatedAt, record.updatedAt)
    if (record.seenToday && !seenUsers.has(record.userId)) {
      seenUsers.add(record.userId)
    }
  }
  aggregated.uniqueUsers = seenUsers.size
  if (aggregated.updatedAt === 0) {
    aggregated.updatedAt = Date.now()
  }
  return aggregated
}

export function buildAnalyticsDailyStatsFromEventRecords(
  date: string,
  records: AnalyticsEventRecord[],
): DailyStats {
  if (!DATE_RE.test(date) || records.length === 0) return emptyDailyStats(date)
  const aggregated = emptyDailyStats(date)
  aggregated.updatedAt = 0
  const seenUsers = new Set<string>()

  for (const record of records) {
    if (record.date !== date) continue
    applyAnalyticsEventCounters(aggregated, record.type)
    aggregated.totalCostUsd += record.costUsd
    aggregated.updatedAt = Math.max(aggregated.updatedAt, record.createdAt)
    if (record.markSeen) {
      seenUsers.add(record.userId)
    }
  }

  aggregated.uniqueUsers = seenUsers.size
  if (aggregated.updatedAt === 0) {
    aggregated.updatedAt = Date.now()
  }
  return aggregated
}

export function buildAnalyticsLifetimeTotalsFromUserLifetimeRecords(
  records: AnalyticsUserLifetimeRecord[],
  options: AnalyticsLifetimeBuildOptions = {},
): LifetimeTotals {
  const baseline = options.legacyBaseline ? parseLifetimeTotals(options.legacyBaseline) : null
  const planBreakdown = options.planBreakdown
    ? normalizePlanBreakdown(options.planBreakdown)
    : baseline?.planBreakdown ?? emptyLifetimeTotals().planBreakdown

  let totalUsers = baseline?.totalUsers ?? 0
  let totalInteractions = baseline?.totalInteractions ?? 0
  let totalCostUsd = baseline?.totalCostUsd ?? 0
  let totalRevenue = options.totalRevenue ?? baseline?.totalRevenue ?? 0
  let lastUpdatedAt = baseline?.lastUpdatedAt ?? 0
  const countedUsers = new Set<string>()

  for (const record of records) {
    totalInteractions += record.totalInteractions
    totalCostUsd += record.totalCostUsd
    lastUpdatedAt = Math.max(lastUpdatedAt, record.updatedAt)
    if (record.countsTowardTotalUsers && !countedUsers.has(record.userId)) {
      countedUsers.add(record.userId)
      totalUsers += 1
    }
  }

  return {
    totalUsers,
    totalInteractions,
    totalCostUsd,
    totalRevenue,
    planBreakdown,
    lastUpdatedAt: lastUpdatedAt || Date.now(),
  }
}

export function buildAnalyticsLifetimeTotalsFromEventRecords(
  records: AnalyticsEventRecord[],
  options: AnalyticsLifetimeBuildOptions = {},
): LifetimeTotals {
  const baseline = options.legacyBaseline ? parseLifetimeTotals(options.legacyBaseline) : null
  const planBreakdown = options.planBreakdown
    ? normalizePlanBreakdown(options.planBreakdown)
    : baseline?.planBreakdown ?? emptyLifetimeTotals().planBreakdown

  let totalUsers = baseline?.totalUsers ?? 0
  let totalInteractions = baseline?.totalInteractions ?? 0
  let totalCostUsd = baseline?.totalCostUsd ?? 0
  const totalRevenue = options.totalRevenue ?? baseline?.totalRevenue ?? 0
  let lastUpdatedAt = baseline?.lastUpdatedAt ?? 0
  const countedUsers = new Set<string>()

  for (const record of records) {
    if (record.type !== 'seen') {
      totalInteractions += 1
      totalCostUsd += record.costUsd
    }
    lastUpdatedAt = Math.max(lastUpdatedAt, record.createdAt)
    if (record.markSeen && !countedUsers.has(record.userId)) {
      countedUsers.add(record.userId)
      totalUsers += 1
    }
  }

  return {
    totalUsers,
    totalInteractions,
    totalCostUsd,
    totalRevenue,
    planBreakdown,
    lastUpdatedAt: lastUpdatedAt || Date.now(),
  }
}

export async function buildAnalyticsDailyStatsFromV2(kv: KVStore, date: string): Promise<DailyStats> {
  const cached = await getAnalyticsDaySummary(kv, date)
  if (cached) return cached
  const records = await listAnalyticsUserDayRecordsForDate(kv, date)
  return buildAnalyticsDailyStatsFromUserDayRecords(date, records)
}

export async function buildAnalyticsDailyStatsRangeFromV2(
  kv: KVStore,
  dates: string[],
): Promise<DailyStats[]> {
  return Promise.all(dates.map((date) => buildAnalyticsDailyStatsFromV2(kv, date)))
}

export async function buildAnalyticsLifetimeTotalsFromV2(
  kv: KVStore,
  options: AnalyticsLifetimeBuildOptions = {},
): Promise<LifetimeTotals> {
  const meta = await getAnalyticsMeta(kv)
  const records = await listAnalyticsUserLifetimeRecords(kv)
  return buildAnalyticsLifetimeTotalsFromUserLifetimeRecords(records, {
    legacyBaseline: options.legacyBaseline ?? meta?.legacyLifetimeBaseline ?? null,
    totalRevenue: options.totalRevenue,
    planBreakdown: options.planBreakdown,
  })
}

export async function buildAnalyticsDailyStatsFromAppendLog(
  kv: KVStore,
  date: string,
): Promise<DailyStats> {
  const records = await listAnalyticsEventRecordsForDate(kv, date)
  return buildAnalyticsDailyStatsFromEventRecords(date, records)
}

export async function buildAnalyticsLifetimeTotalsFromAppendLog(
  kv: KVStore,
  options: AnalyticsLifetimeBuildOptions = {},
): Promise<LifetimeTotals> {
  const meta = await getAnalyticsMeta(kv)
  const records = await listAllAnalyticsEventRecords(kv)
  return buildAnalyticsLifetimeTotalsFromEventRecords(records, {
    legacyBaseline: options.legacyBaseline ?? meta?.legacyLifetimeBaseline ?? null,
    totalRevenue: options.totalRevenue,
    planBreakdown: options.planBreakdown,
  })
}
