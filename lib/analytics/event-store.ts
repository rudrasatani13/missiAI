// ─── Analytics Event Store (KV-backed) ───────────────────────────────────────

import type { KVStore } from '@/types'
import type { DailyStats, LifetimeTotals } from '@/types/analytics'
import { emptyDailyStats, emptyLifetimeTotals } from '@/types/analytics'
import {
  addAnalyticsDayIndexUserId,
  addAnalyticsUserIndexUserId,
  appendAnalyticsEventRecord,
  buildAnalyticsDailyStatsFromEventRecords,
  buildAnalyticsDailyStatsFromV2,
  buildAnalyticsLifetimeTotalsFromAppendLog,
  buildAnalyticsLifetimeTotalsFromV2,
  deleteAnalyticsDaySummary,
  deleteAnalyticsSnapshotCache,
  emptyAnalyticsUserDayRecord,
  emptyAnalyticsUserLifetimeRecord,
  enqueueAnalyticsPendingEvent,
  getAnalyticsAggregationState,
  getAnalyticsDaySummary,
  getAnalyticsEventRecordByKey,
  getAnalyticsUserDayRecord,
  getAnalyticsUserLifetimeRecord,
  listAnalyticsDayUserIds,
  listAnalyticsEventDates,
  listAnalyticsEventRecordsForDate,
  markAnalyticsPendingEventsProcessed,
  putAnalyticsDaySummary,
  putAnalyticsUserDayRecord,
  putAnalyticsUserLifetimeRecord,
  type AnalyticsEventRecord,
} from '@/lib/analytics/analytics-record-store'
import { getTodayDate } from '@/lib/billing/usage-tracker'
import { logError } from '@/lib/server/observability/logger'

function applyEventCounters(
  target: Pick<DailyStats, 'totalRequests' | 'voiceInteractions' | 'chatRequests' | 'ttsRequests' | 'memoryReads' | 'memoryWrites' | 'actionsExecuted' | 'errorCount' | 'newSignups'>,
  type: EventType,
): void {
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

function createAnalyticsEventId(now: number): string {
  return `${now}_${crypto.randomUUID().replace(/-/g, '')}`.slice(0, 120)
}

async function appendRawAnalyticsEvent(
  kv: KVStore,
  event: RawAnalyticsAppendEvent,
): Promise<AnalyticsEventRecord> {
  const now = event.createdAt ?? Date.now()
  const rawEvent: AnalyticsEventRecord = {
    eventId: createAnalyticsEventId(now),
    userId: event.userId,
    date: event.date,
    type: event.type,
    costUsd: event.costUsd ?? 0,
    markSeen: event.markSeen,
    metadata: event.metadata ?? {},
    createdAt: now,
  }
  const eventKey = await appendAnalyticsEventRecord(kv, rawEvent)
  await enqueueAnalyticsPendingEvent(kv, eventKey, rawEvent.date, now)
  return rawEvent
}

async function applyRawAnalyticsEventToDerivedViews(
  kv: KVStore,
  event: AnalyticsEventRecord,
): Promise<void> {
  const existingDayRecord = await getAnalyticsUserDayRecord(kv, event.userId, event.date)
  const nextDayRecord = existingDayRecord
    ? { ...existingDayRecord }
    : emptyAnalyticsUserDayRecord(event.userId, event.date)

  if (event.markSeen) {
    nextDayRecord.seenToday = true
    nextDayRecord.uniqueUsers = 1
  }

  if (event.type !== 'seen') {
    applyEventCounters(nextDayRecord, event.type)
    nextDayRecord.totalCostUsd += event.costUsd
  }
  nextDayRecord.updatedAt = Math.max(nextDayRecord.updatedAt, event.createdAt)

  const existingLifetimeRecord = await getAnalyticsUserLifetimeRecord(kv, event.userId)
  const nextLifetimeRecord = existingLifetimeRecord
    ? { ...existingLifetimeRecord }
    : emptyAnalyticsUserLifetimeRecord(event.userId)

  if (event.type !== 'seen') {
    nextLifetimeRecord.totalInteractions += 1
    nextLifetimeRecord.totalCostUsd += event.costUsd
    if (event.type === 'signup') {
      nextLifetimeRecord.totalSignups += 1
    }
  }
  if (nextLifetimeRecord.firstSeenAt === 0) {
    nextLifetimeRecord.firstSeenAt = event.createdAt
  }
  if (event.markSeen) {
    nextLifetimeRecord.countsTowardTotalUsers = true
  }
  nextLifetimeRecord.lastSeenAt = Math.max(nextLifetimeRecord.lastSeenAt, event.createdAt)
  nextLifetimeRecord.updatedAt = Math.max(nextLifetimeRecord.updatedAt, event.createdAt)

  await putAnalyticsUserDayRecord(kv, nextDayRecord)
  await putAnalyticsUserLifetimeRecord(kv, nextLifetimeRecord)
  await addAnalyticsDayIndexUserId(kv, event.date, event.userId)
  await addAnalyticsUserIndexUserId(kv, event.userId)
}

async function processAnalyticsAggregationBacklog(
  kv: KVStore,
  maxEvents = 500,
): Promise<void> {
  const state = await getAnalyticsAggregationState(kv)
  if (state.pendingEventKeys.length === 0) return

  const processedKeys: string[] = []
  const touchedDates = new Set<string>()
  for (const eventKey of state.pendingEventKeys.slice(0, maxEvents)) {
    const event = await getAnalyticsEventRecordByKey(kv, eventKey)
    processedKeys.push(eventKey)
    if (!event) continue
    await applyRawAnalyticsEventToDerivedViews(kv, event)
    touchedDates.add(event.date)
  }

  if (touchedDates.size > 0) {
    await Promise.all([
      ...[...touchedDates].map((date) =>
        deleteAnalyticsDaySummary(kv, date).catch((err) => logError('analytics.backlog.summary_delete_error', err)),
      ),
      deleteAnalyticsSnapshotCache(kv).catch((err) => logError('analytics.backlog.snapshot_delete_error', err)),
    ])
  }

  await markAnalyticsPendingEventsProcessed(kv, processedKeys)
}

// ─── Record Event ─────────────────────────────────────────────────────────────

export type EventType = 'chat' | 'tts' | 'memory_read' | 'memory_write' | 'action' | 'error' | 'signup'

export interface AnalyticsUsageEvent {
  type: EventType
  userId: string
  costUsd?: number
  metadata?: Record<string, unknown>
}

interface RawAnalyticsAppendEvent {
  type: EventType | 'seen'
  userId: string
  costUsd?: number
  metadata?: Record<string, unknown>
  date: string
  markSeen: boolean
  createdAt?: number
}

export async function recordEvent(
  kv: KVStore,
  event: AnalyticsUsageEvent
): Promise<void> {
  const date = getTodayDate()

  try {
    await appendRawAnalyticsEvent(kv, { ...event, date, markSeen: false, type: event.type })
    await processAnalyticsAggregationBacklog(kv)
  } catch (err) {
    logError('analytics.record_event.error', err, event.userId)
    throw err
  }
}

export async function recordAnalyticsUsage(
  kv: KVStore,
  event: AnalyticsUsageEvent & { date?: string }
): Promise<void> {
  const date = event.date ?? getTodayDate()

  try {
    await appendRawAnalyticsEvent(kv, {
      ...event,
      date,
      markSeen: true,
      type: event.type,
    })
    await processAnalyticsAggregationBacklog(kv)
  } catch (err) {
    logError('analytics.record_usage.error', err, event.userId)
    throw err
  }
}

// ─── Get Daily Stats ──────────────────────────────────────────────────────────

export async function getDailyStats(
  kv: KVStore,
  date: string
): Promise<DailyStats> {
  try {
    await processAnalyticsAggregationBacklog(kv)
  } catch (err) {
    logError('analytics.daily_stats.backlog_error', err)
  }

  try {
    const rawEvents = await listAnalyticsEventRecordsForDate(kv, date)
    if (rawEvents.length > 0) {
      const stats = buildAnalyticsDailyStatsFromEventRecords(date, rawEvents)
      try {
        await putAnalyticsDaySummary(kv, stats)
      } catch (err) {
        logError('analytics.daily_stats.summary_write_error', err)
      }
      return stats
    }

    const cachedV2Stats = await getAnalyticsDaySummary(kv, date)
    if (cachedV2Stats) return cachedV2Stats

    const v2UserIds = await listAnalyticsDayUserIds(kv, date)
    if (v2UserIds.length > 0) {
      const stats = await buildAnalyticsDailyStatsFromV2(kv, date)
      try {
        await putAnalyticsDaySummary(kv, stats)
      } catch (err) {
        logError('analytics.daily_stats.summary_write_error', err)
      }
      return stats
    }

    return emptyDailyStats(date)
  } catch (err) {
    logError('analytics.daily_stats.error', err)
    return emptyDailyStats(date)
  }
}

// ─── Lifetime Totals ──────────────────────────────────────────────────────────

export async function getLifetimeTotals(
  kv: KVStore
): Promise<LifetimeTotals> {
  try {
    await processAnalyticsAggregationBacklog(kv)
  } catch (err) {
    logError('analytics.lifetime.backlog_error', err)
  }

  try {
    const rawEventDates = await listAnalyticsEventDates(kv)
    if (rawEventDates.length > 0) {
      return buildAnalyticsLifetimeTotalsFromAppendLog(kv)
    }
    return buildAnalyticsLifetimeTotalsFromV2(kv)
  } catch (err) {
    logError('analytics.lifetime.error', err)
    return emptyLifetimeTotals()
  }
}

// ─── Unique User Tracking ─────────────────────────────────────────────────────

export async function getUniqueUserCount(
  kv: KVStore,
  date: string
): Promise<number> {
  try {
    return (await getDailyStats(kv, date)).uniqueUsers
  } catch (err) {
    logError('analytics.unique_users.error', err)
    return 0
  }
}

export async function recordUserSeen(
  kv: KVStore,
  userId: string,
  date: string
): Promise<void> {
  try {
    await appendRawAnalyticsEvent(kv, {
      type: 'seen',
      userId,
      date,
      markSeen: true,
      costUsd: 0,
      metadata: {},
    })
    await processAnalyticsAggregationBacklog(kv)
  } catch (err) {
    logError('analytics.record_seen.error', err, userId)
    throw err
  }
}

export interface AnalyticsAggregationStatus {
  pendingEventCount: number
  pendingDates: string[]
  lastAppendedAt: number
  lastProcessedAt: number
  lagMs: number
  isCaughtUp: boolean
}

export async function getAnalyticsAggregationStatus(
  kv: KVStore,
): Promise<AnalyticsAggregationStatus> {
  const state = await getAnalyticsAggregationState(kv)
  const pendingEventCount = state.pendingEventKeys.length
  return {
    pendingEventCount,
    pendingDates: state.pendingDates,
    lastAppendedAt: state.lastAppendedAt,
    lastProcessedAt: state.lastProcessedAt,
    lagMs: pendingEventCount === 0
      ? 0
      : Math.max(0, Date.now() - (state.lastProcessedAt || state.lastAppendedAt || Date.now())),
    isCaughtUp: pendingEventCount === 0,
  }
}
