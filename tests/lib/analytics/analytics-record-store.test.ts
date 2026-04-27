import { beforeEach, describe, expect, it } from 'vitest'
import type { KVListResult, KVStore } from '@/types'
import type { AnalyticsSnapshot, DailyStats, LifetimeTotals } from '@/types/analytics'
import {
  ANALYTICS_DAY_SUMMARY_TTL_SECONDS,
  ANALYTICS_SNAPSHOT_TTL_SECONDS,
  ANALYTICS_USER_DAY_TTL_SECONDS,
  addAnalyticsDayIndexUserId,
  addAnalyticsEventDate,
  addAnalyticsEventKeyForDate,
  addAnalyticsUserIndexUserId,
  appendAnalyticsEventRecord,
  buildAnalyticsDailyStatsFromAppendLog,
  buildAnalyticsDailyStatsFromEventRecords,
  buildAnalyticsDailyStatsFromUserDayRecords,
  buildAnalyticsDailyStatsFromV2,
  buildAnalyticsDailyStatsRangeFromV2,
  buildAnalyticsDayIndexKey,
  buildAnalyticsEventRecordKey,
  buildAnalyticsLifetimeTotalsFromAppendLog,
  buildAnalyticsLifetimeTotalsFromEventRecords,
  buildAnalyticsDaySummaryKey,
  buildAnalyticsLifetimeTotalsFromUserLifetimeRecords,
  buildAnalyticsLifetimeTotalsFromV2,
  buildAnalyticsMetaKey,
  buildAnalyticsSnapshotKey,
  buildAnalyticsUserDayRecordKey,
  buildAnalyticsUserIndexKey,
  buildAnalyticsUserLifetimeRecordKey,
  emptyAnalyticsMeta,
  emptyAnalyticsAggregationState,
  emptyAnalyticsUserDayRecord,
  emptyAnalyticsUserLifetimeRecord,
  enqueueAnalyticsPendingEvent,
  getAnalyticsAggregationState,
  getAnalyticsDaySummary,
  getAnalyticsEventRecord,
  getAnalyticsMeta,
  getAnalyticsSnapshotCache,
  getAnalyticsUserDayRecord,
  getAnalyticsUserLifetimeRecord,
  listAnalyticsEventDates,
  listAnalyticsEventRecordsForDate,
  listAnalyticsDayUserIds,
  listAnalyticsUserDayRecordsForDate,
  listAnalyticsUserIds,
  listAnalyticsUserLifetimeRecords,
  markAnalyticsPendingEventsProcessed,
  putAnalyticsDaySummary,
  putAnalyticsMeta,
  putAnalyticsSnapshotCache,
  putAnalyticsUserDayRecord,
  putAnalyticsUserLifetimeRecord,
} from '@/lib/analytics/analytics-record-store'

interface KVWithStore extends KVStore {
  _store: Map<string, string>
  _ttls: Map<string, number | undefined>
}

function makeKV(withList = false): KVWithStore {
  const store = new Map<string, string>()
  const ttls = new Map<string, number | undefined>()
  const kv: KVWithStore = {
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string, options?: { expirationTtl?: number }) => {
      store.set(key, value)
      ttls.set(key, options?.expirationTtl)
    },
    delete: async (key: string) => {
      store.delete(key)
      ttls.delete(key)
    },
    _store: store,
    _ttls: ttls,
  }
  if (withList) {
    kv.list = async ({ prefix = '', cursor, limit = 1000 } = {}): Promise<KVListResult> => {
      const keys = [...store.keys()].filter((key) => key.startsWith(prefix)).sort()
      const start = cursor ? parseInt(cursor, 10) || 0 : 0
      const slice = keys.slice(start, start + limit)
      const next = start + slice.length
      return {
        keys: slice.map((name) => ({ name })),
        list_complete: next >= keys.length,
        cursor: next >= keys.length ? undefined : String(next),
      }
    }
  }
  return kv
}

function makeUserDay(overrides: Partial<ReturnType<typeof emptyAnalyticsUserDayRecord>> = {}) {
  return {
    ...emptyAnalyticsUserDayRecord('user_1', '2026-04-24'),
    seenToday: true,
    uniqueUsers: 1,
    updatedAt: 100,
    ...overrides,
  }
}

function makeUserLifetime(overrides: Partial<ReturnType<typeof emptyAnalyticsUserLifetimeRecord>> = {}) {
  return {
    ...emptyAnalyticsUserLifetimeRecord('user_1'),
    totalInteractions: 3,
    totalCostUsd: 0.015,
    countsTowardTotalUsers: true,
    firstSeenAt: 50,
    lastSeenAt: 150,
    updatedAt: 150,
    ...overrides,
  }
}

describe('analytics-record-store', () => {
  let kv: KVWithStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('round-trips user-day records through the v2 key with the default ttl', async () => {
    const record = makeUserDay({
      userId: 'user_1',
      date: '2026-04-24',
      totalRequests: 4,
      chatRequests: 2,
      totalCostUsd: 0.02,
    })

    await putAnalyticsUserDayRecord(kv, record)

    expect(kv._ttls.get(buildAnalyticsUserDayRecordKey('user_1', '2026-04-24'))).toBe(ANALYTICS_USER_DAY_TTL_SECONDS)
    expect(await getAnalyticsUserDayRecord(kv, 'user_1', '2026-04-24')).toEqual(record)
  })

  it('round-trips user-lifetime records and meta records', async () => {
    const lifetime = makeUserLifetime({ userId: 'user_meta', totalInteractions: 7, totalCostUsd: 1.25 })
    const meta = {
      ...emptyAnalyticsMeta(),
      cutoverDate: '2026-04-24',
      legacyLifetimeBaseline: {
        totalUsers: 10,
        totalInteractions: 25,
        totalCostUsd: 5.5,
        totalRevenue: 12,
        planBreakdown: { free: 6, plus: 3, pro: 1 },
        lastUpdatedAt: 200,
      },
      migratedAt: 300,
      updatedAt: 300,
    }

    await putAnalyticsUserLifetimeRecord(kv, lifetime)
    await putAnalyticsMeta(kv, meta)

    expect(await getAnalyticsUserLifetimeRecord(kv, 'user_meta')).toEqual(lifetime)
    expect(await getAnalyticsMeta(kv)).toEqual(meta)
    expect(kv._store.has(buildAnalyticsMetaKey())).toBe(true)
    expect(kv._store.has(buildAnalyticsUserLifetimeRecordKey('user_meta'))).toBe(true)
  })

  it('round-trips append-log records, event indexes, and aggregation state', async () => {
    const record = {
      eventId: 'evt_1',
      userId: 'user_evt',
      date: '2026-04-24',
      type: 'chat' as const,
      costUsd: 0.01,
      markSeen: true,
      metadata: { source: 'test' },
      createdAt: 100,
    }

    const eventKey = await appendAnalyticsEventRecord(kv, record)
    await enqueueAnalyticsPendingEvent(kv, eventKey, record.date, record.createdAt)

    expect(eventKey).toBe(buildAnalyticsEventRecordKey(record.date, record.eventId))
    expect(await getAnalyticsEventRecord(kv, record.date, record.eventId)).toEqual(record)
    expect(await listAnalyticsEventDates(kv)).toEqual([record.date])
    expect(await listAnalyticsEventRecordsForDate(kv, record.date)).toEqual([record])
    expect(await getAnalyticsAggregationState(kv)).toEqual({
      ...emptyAnalyticsAggregationState(),
      pendingEventKeys: [eventKey],
      pendingDates: [record.date],
      totalAppendedEvents: 1,
      lastAppendedAt: record.createdAt,
      updatedAt: expect.any(Number),
    })

    await markAnalyticsPendingEventsProcessed(kv, [eventKey], 200)

    expect(await getAnalyticsAggregationState(kv)).toEqual({
      ...emptyAnalyticsAggregationState(),
      totalAppendedEvents: 1,
      totalProcessedEvents: 1,
      lastAppendedAt: record.createdAt,
      lastProcessedAt: 200,
      updatedAt: expect.any(Number),
    })
  })

  it('round-trips day summary and snapshot caches with their expected ttl behavior', async () => {
    const stats: DailyStats = {
      date: '2026-04-24',
      totalRequests: 8,
      uniqueUsers: 3,
      voiceInteractions: 2,
      chatRequests: 2,
      ttsRequests: 1,
      memoryReads: 2,
      memoryWrites: 1,
      actionsExecuted: 1,
      totalCostUsd: 0.12,
      errorCount: 0,
      newSignups: 1,
      updatedAt: 400,
    }
    const lifetime: LifetimeTotals = {
      totalUsers: 12,
      totalInteractions: 60,
      totalCostUsd: 4.2,
      totalRevenue: 10,
      planBreakdown: { free: 8, plus: 3, pro: 1 },
      lastUpdatedAt: 500,
    }
    const snapshot: AnalyticsSnapshot = {
      today: stats,
      yesterday: { ...stats, date: '2026-04-23', totalRequests: 5 },
      last7Days: [stats],
      lifetime,
      generatedAt: 600,
    }

    await putAnalyticsDaySummary(kv, stats)
    await putAnalyticsSnapshotCache(kv, snapshot)

    expect(kv._ttls.get(buildAnalyticsDaySummaryKey('2026-04-24'))).toBe(ANALYTICS_DAY_SUMMARY_TTL_SECONDS)
    expect(kv._ttls.get(buildAnalyticsSnapshotKey())).toBe(ANALYTICS_SNAPSHOT_TTL_SECONDS)
    expect(await getAnalyticsDaySummary(kv, '2026-04-24')).toEqual(stats)
    expect(await getAnalyticsSnapshotCache(kv)).toEqual(snapshot)
  })

  it('uses fallback day and user indexes when kv.list is unavailable', async () => {
    const dayOne = makeUserDay({ userId: 'user_1', date: '2026-04-24', totalRequests: 2, updatedAt: 100 })
    const dayTwo = makeUserDay({ userId: 'user_2', date: '2026-04-24', totalRequests: 3, updatedAt: 200 })
    const lifetimeOne = makeUserLifetime({ userId: 'user_1' })
    const lifetimeTwo = makeUserLifetime({ userId: 'user_2', totalInteractions: 4, updatedAt: 220 })

    await putAnalyticsUserDayRecord(kv, dayOne)
    await putAnalyticsUserDayRecord(kv, dayTwo)
    await putAnalyticsUserLifetimeRecord(kv, lifetimeOne)
    await putAnalyticsUserLifetimeRecord(kv, lifetimeTwo)
    await addAnalyticsDayIndexUserId(kv, '2026-04-24', 'user_1')
    await addAnalyticsDayIndexUserId(kv, '2026-04-24', 'user_2')
    await addAnalyticsUserIndexUserId(kv, 'user_1')
    await addAnalyticsUserIndexUserId(kv, 'user_2')

    expect(await listAnalyticsDayUserIds(kv, '2026-04-24')).toEqual(['user_1', 'user_2'])
    expect(await listAnalyticsUserIds(kv)).toEqual(['user_1', 'user_2'])
    expect((await listAnalyticsUserDayRecordsForDate(kv, '2026-04-24')).map((record) => record.userId)).toEqual(['user_1', 'user_2'])
    expect((await listAnalyticsUserLifetimeRecords(kv)).map((record) => record.userId)).toEqual(['user_1', 'user_2'])
    expect(kv._store.has(buildAnalyticsDayIndexKey('2026-04-24'))).toBe(true)
    expect(kv._store.has(buildAnalyticsUserIndexKey())).toBe(true)
  })

  it('supports prefix-list fallback for user-day and user-lifetime records when kv.list is available', async () => {
    const listedKV = makeKV(true)
    const aprilOne = makeUserDay({ userId: 'user_a', date: '2026-04-24', totalRequests: 2, updatedAt: 120 })
    const aprilTwo = makeUserDay({ userId: 'user_b', date: '2026-04-24', totalRequests: 5, updatedAt: 180 })
    const mayOne = makeUserDay({ userId: 'user_c', date: '2026-05-01', totalRequests: 7, updatedAt: 220 })
    const lifeA = makeUserLifetime({ userId: 'user_a', totalInteractions: 2 })
    const lifeB = makeUserLifetime({ userId: 'user_b', totalInteractions: 4 })

    await putAnalyticsUserDayRecord(listedKV, aprilOne)
    await putAnalyticsUserDayRecord(listedKV, aprilTwo)
    await putAnalyticsUserDayRecord(listedKV, mayOne)
    await putAnalyticsUserLifetimeRecord(listedKV, lifeA)
    await putAnalyticsUserLifetimeRecord(listedKV, lifeB)

    expect(await listAnalyticsDayUserIds(listedKV, '2026-04-24')).toEqual(['user_a', 'user_b'])
    expect((await listAnalyticsUserDayRecordsForDate(listedKV, '2026-04-24')).map((record) => record.userId)).toEqual(['user_a', 'user_b'])
    expect(await listAnalyticsUserIds(listedKV)).toEqual(['user_a', 'user_b'])
  })

  it('builds daily stats and lifetime totals from raw append-log records', async () => {
    const events = [
      {
        eventId: 'evt_seen',
        userId: 'user_1',
        date: '2026-04-24',
        type: 'seen' as const,
        costUsd: 0,
        markSeen: true,
        metadata: {},
        createdAt: 100,
      },
      {
        eventId: 'evt_chat',
        userId: 'user_1',
        date: '2026-04-24',
        type: 'chat' as const,
        costUsd: 0.01,
        markSeen: true,
        metadata: {},
        createdAt: 120,
      },
      {
        eventId: 'evt_tts',
        userId: 'user_2',
        date: '2026-04-25',
        type: 'tts' as const,
        costUsd: 0.02,
        markSeen: true,
        metadata: {},
        createdAt: 150,
      },
    ]

    for (const event of events) {
      await appendAnalyticsEventRecord(kv, event)
      await addAnalyticsEventDate(kv, event.date)
      await addAnalyticsEventKeyForDate(kv, event.date, buildAnalyticsEventRecordKey(event.date, event.eventId))
    }

    expect(buildAnalyticsDailyStatsFromEventRecords('2026-04-24', events)).toEqual({
      date: '2026-04-24',
      totalRequests: 1,
      uniqueUsers: 1,
      voiceInteractions: 1,
      chatRequests: 1,
      ttsRequests: 0,
      memoryReads: 0,
      memoryWrites: 0,
      actionsExecuted: 0,
      totalCostUsd: 0.01,
      errorCount: 0,
      newSignups: 0,
      updatedAt: 120,
    })

    expect(await buildAnalyticsDailyStatsFromAppendLog(kv, '2026-04-24')).toEqual({
      date: '2026-04-24',
      totalRequests: 1,
      uniqueUsers: 1,
      voiceInteractions: 1,
      chatRequests: 1,
      ttsRequests: 0,
      memoryReads: 0,
      memoryWrites: 0,
      actionsExecuted: 0,
      totalCostUsd: 0.01,
      errorCount: 0,
      newSignups: 0,
      updatedAt: 120,
    })

    expect(buildAnalyticsLifetimeTotalsFromEventRecords(events, {
      legacyBaseline: {
        totalUsers: 10,
        totalInteractions: 20,
        totalCostUsd: 1,
        totalRevenue: 3,
        planBreakdown: { free: 8, plus: 1, pro: 1 },
        lastUpdatedAt: 90,
      },
    })).toEqual({
      totalUsers: 12,
      totalInteractions: 22,
      totalCostUsd: 1.03,
      totalRevenue: 3,
      planBreakdown: { free: 8, plus: 1, pro: 1 },
      lastUpdatedAt: 150,
    })

    expect(await buildAnalyticsLifetimeTotalsFromAppendLog(kv)).toEqual({
      totalUsers: 2,
      totalInteractions: 2,
      totalCostUsd: 0.03,
      totalRevenue: 0,
      planBreakdown: { free: 0, plus: 0, pro: 0 },
      lastUpdatedAt: 150,
    })
  })

  it('builds daily stats from user-day records and prefers cached summaries in the v2 builder', async () => {
    const records = [
      makeUserDay({
        userId: 'user_1',
        date: '2026-04-24',
        totalRequests: 2,
        chatRequests: 1,
        voiceInteractions: 1,
        totalCostUsd: 0.01,
        updatedAt: 100,
      }),
      makeUserDay({
        userId: 'user_2',
        date: '2026-04-24',
        totalRequests: 3,
        ttsRequests: 1,
        memoryReads: 1,
        actionsExecuted: 1,
        totalCostUsd: 0.02,
        updatedAt: 200,
      }),
    ]

    expect(buildAnalyticsDailyStatsFromUserDayRecords('2026-04-24', records)).toEqual({
      date: '2026-04-24',
      totalRequests: 5,
      uniqueUsers: 2,
      voiceInteractions: 1,
      chatRequests: 1,
      ttsRequests: 1,
      memoryReads: 1,
      memoryWrites: 0,
      actionsExecuted: 1,
      totalCostUsd: 0.03,
      errorCount: 0,
      newSignups: 0,
      updatedAt: 200,
    })

    for (const record of records) {
      await putAnalyticsUserDayRecord(kv, record)
      await addAnalyticsDayIndexUserId(kv, record.date, record.userId)
    }

    const cached: DailyStats = {
      date: '2026-04-24',
      totalRequests: 99,
      uniqueUsers: 4,
      voiceInteractions: 50,
      chatRequests: 10,
      ttsRequests: 20,
      memoryReads: 10,
      memoryWrites: 5,
      actionsExecuted: 4,
      totalCostUsd: 8.75,
      errorCount: 1,
      newSignups: 3,
      updatedAt: 999,
    }
    await putAnalyticsDaySummary(kv, cached)

    expect(await buildAnalyticsDailyStatsFromV2(kv, '2026-04-24')).toEqual(cached)
    expect(await buildAnalyticsDailyStatsRangeFromV2(kv, ['2026-04-24', '2026-04-23'])).toEqual([
      cached,
      expect.objectContaining({ date: '2026-04-23', totalRequests: 0, uniqueUsers: 0 }),
    ])
  })

  it('builds lifetime totals from user-lifetime records with a legacy baseline and external fields', async () => {
    const records = [
      makeUserLifetime({ userId: 'user_1', totalInteractions: 3, totalCostUsd: 0.02, countsTowardTotalUsers: true, updatedAt: 300 }),
      makeUserLifetime({ userId: 'user_2', totalInteractions: 4, totalCostUsd: 0.03, countsTowardTotalUsers: true, updatedAt: 450 }),
      makeUserLifetime({ userId: 'user_3', totalInteractions: 10, totalCostUsd: 0.05, countsTowardTotalUsers: false, updatedAt: 350 }),
    ]
    const baseline: LifetimeTotals = {
      totalUsers: 5,
      totalInteractions: 20,
      totalCostUsd: 1.5,
      totalRevenue: 9,
      planBreakdown: { free: 3, plus: 1, pro: 1 },
      lastUpdatedAt: 200,
    }

    expect(buildAnalyticsLifetimeTotalsFromUserLifetimeRecords(records, {
      legacyBaseline: baseline,
      totalRevenue: 12,
      planBreakdown: { free: 4, plus: 2, pro: 1 },
    })).toEqual({
      totalUsers: 7,
      totalInteractions: 37,
      totalCostUsd: 1.6,
      totalRevenue: 12,
      planBreakdown: { free: 4, plus: 2, pro: 1 },
      lastUpdatedAt: 450,
    })

    const listedKV = makeKV(true)
    await putAnalyticsMeta(listedKV, {
      ...emptyAnalyticsMeta(),
      legacyLifetimeBaseline: baseline,
      updatedAt: 500,
    })
    for (const record of records) {
      await putAnalyticsUserLifetimeRecord(listedKV, record)
    }

    expect(await buildAnalyticsLifetimeTotalsFromV2(listedKV, {
      totalRevenue: 12,
      planBreakdown: { free: 4, plus: 2, pro: 1 },
    })).toEqual({
      totalUsers: 7,
      totalInteractions: 37,
      totalCostUsd: 1.6,
      totalRevenue: 12,
      planBreakdown: { free: 4, plus: 2, pro: 1 },
      lastUpdatedAt: 450,
    })
  })
})
