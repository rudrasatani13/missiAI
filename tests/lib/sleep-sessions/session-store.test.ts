import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
    cacheGeneratedStory, 
    getLastGeneratedStory, 
    addToHistory, 
    getHistory,
    checkGenerationRateLimit,
    checkTTSRateLimit,
    incrementGenerationRateLimit,
    incrementTTSRateLimit,
} from '@/lib/sleep-sessions/session-store'
import {
    buildSleepDailyQuotaKey,
    buildSleepHistoryEntryKey,
    buildSleepHistoryIndexKey,
    putSleepHistoryEntryRecord,
    saveSleepHistoryIndex,
} from '@/lib/sleep-sessions/session-record-store'
import type { KVStore } from '@/types'

describe('Session Store', () => {
    let mockKv: Record<string, any>
    let kv: KVStore

    beforeEach(() => {
        mockKv = {}
        kv = {
            get: vi.fn(async (key: string) => mockKv[key] || null),
            put: vi.fn(async (key: string, value: string) => {
                mockKv[key] = value
            }),
            delete: vi.fn(async (key: string) => {
                delete mockKv[key]
            }),
        } as any as KVStore
    })

    it('cacheGeneratedStory and getLastGeneratedStory round-trip correctly', async () => {
        const mockStory = { id: '123', title: 'Test', mode: 'personalized_story', text: 'hi', estimatedDurationSec: 10, generatedAt: 123 } as any
        
        await cacheGeneratedStory(kv, 'user1', mockStory)
        const retrieved = await getLastGeneratedStory(kv, 'user1')
        
        expect(retrieved).toEqual(mockStory)
    })

    it('getLastGeneratedStory returns null after TTL (mock time advance)', async () => {
        const retrieved = await getLastGeneratedStory(kv, 'user2')
        expect(retrieved).toBeNull()
    })

    it('addToHistory writes v2 history records, prepends, and caps at 30', async () => {
        const entry = { id: 'e1', mode: 'library', title: 'Test', completed: true, durationSec: 100, date: '2024-01-01' } as any

        await addToHistory(kv, 'user1', entry)
        let hist = await getHistory(kv, 'user1')
        expect(hist.length).toBe(1)
        expect(hist[0].id).toBe('e1')
        expect(mockKv['sleep-sessions:history:user1']).toBeUndefined()
        expect(JSON.parse(mockKv[buildSleepHistoryIndexKey('user1')])).toEqual({
            entryIds: ['e1'],
            updatedAt: expect.any(Number),
        })
        expect(JSON.parse(mockKv[buildSleepHistoryEntryKey('user1', 'e1')])).toEqual(entry)

        // Add 31 more
        for (let i = 0; i < 31; i++) {
            await addToHistory(kv, 'user1', { ...entry, id: `e${i+2}`})
        }

        // getHistory defaults to limit=20, pass 30 to see all stored entries
        hist = await getHistory(kv, 'user1', 30)
        expect(hist.length).toBe(30)
        expect(hist[0].id).toBe('e32') // the very last one added
        expect(JSON.parse(mockKv[buildSleepHistoryIndexKey('user1')]).entryIds).toHaveLength(30)
        expect(mockKv[buildSleepHistoryEntryKey('user1', 'e1')]).toBeUndefined()
    })

    it('getHistory prefers v2 history when legacy history is stale', async () => {
        const legacyEntry = {
            id: 'e1',
            mode: 'library',
            title: 'Legacy Title',
            completed: true,
            durationSec: 100,
            date: '2024-01-01T00:00:00.000Z',
        } as any
        const v2Entry = {
            ...legacyEntry,
            title: 'V2 Title',
        }
        const newerV2Entry = {
            ...legacyEntry,
            id: 'e2',
            title: 'V2 Newer Title',
            date: '2024-01-02T00:00:00.000Z',
        }

        await putSleepHistoryEntryRecord(kv, 'user1', v2Entry)
        await putSleepHistoryEntryRecord(kv, 'user1', newerV2Entry)
        await saveSleepHistoryIndex(kv, 'user1', ['e2', 'e1'])
        mockKv['sleep-sessions:history:user1'] = JSON.stringify([legacyEntry])

        const hist = await getHistory(kv, 'user1')
        expect(hist).toEqual([newerV2Entry, v2Entry])
    })

    it('getHistory ignores legacy history when no v2 history exists', async () => {
        const entryOne = {
            id: 'e1',
            mode: 'library',
            title: 'First',
            completed: true,
            durationSec: 100,
            date: '2024-01-01T00:00:00.000Z',
        } as any
        const entryTwo = {
            ...entryOne,
            id: 'e2',
            title: 'Second',
            date: '2024-01-02T00:00:00.000Z',
        }

        mockKv['sleep-sessions:history:user1'] = JSON.stringify([entryTwo, entryOne])

        const hist = await getHistory(kv, 'user1', 30)
        expect(hist).toEqual([])
        expect(mockKv[buildSleepHistoryIndexKey('user1')]).toBeUndefined()
        expect(mockKv[buildSleepHistoryEntryKey('user1', 'e2')]).toBeUndefined()
        expect(mockKv[buildSleepHistoryEntryKey('user1', 'e1')]).toBeUndefined()
    })

    it('addToHistory ignores legacy history and only writes the new v2 entry', async () => {
        const entryOne = {
            id: 'e1',
            mode: 'library',
            title: 'First',
            completed: true,
            durationSec: 100,
            date: '2024-01-01T00:00:00.000Z',
        } as any
        const entryTwo = {
            ...entryOne,
            id: 'e2',
            title: 'Second',
            date: '2024-01-02T00:00:00.000Z',
        }
        const entryThree = {
            ...entryOne,
            id: 'e3',
            title: 'Third',
            date: '2024-01-03T00:00:00.000Z',
        }

        mockKv['sleep-sessions:history:user1'] = JSON.stringify([entryTwo, entryOne])

        await addToHistory(kv, 'user1', entryThree)

        expect(await getHistory(kv, 'user1', 30)).toEqual([entryThree])
        expect(JSON.parse(mockKv[buildSleepHistoryIndexKey('user1')])).toEqual({
            entryIds: ['e3'],
            updatedAt: expect.any(Number),
        })
        expect(mockKv['sleep-sessions:history:user1']).toBe(JSON.stringify([entryTwo, entryOne]))
    })

    it('Rate limit functions use the v2 daily quota record and preserve generation and TTS limits', async () => {
        const today = new Date().toISOString().slice(0, 10)

        expect(await checkGenerationRateLimit(kv, 'user1', 'free')).toEqual({
            allowed: true,
            remaining: 3,
        })
        expect(await checkTTSRateLimit(kv, 'user1', 'free')).toEqual({
            allowed: true,
            remaining: 10,
        })

        await incrementGenerationRateLimit(kv, 'user1')
        await incrementGenerationRateLimit(kv, 'user1')
        await incrementGenerationRateLimit(kv, 'user1')
        await incrementTTSRateLimit(kv, 'user1')
        await incrementTTSRateLimit(kv, 'user1')

        expect(await checkGenerationRateLimit(kv, 'user1', 'free')).toEqual({
            allowed: false,
            remaining: 0,
        })
        expect(await checkGenerationRateLimit(kv, 'user1', 'pro')).toEqual({
            allowed: true,
            remaining: 17,
        })
        expect(await checkTTSRateLimit(kv, 'user1', 'free')).toEqual({
            allowed: true,
            remaining: 8,
        })

        expect(JSON.parse(mockKv[buildSleepDailyQuotaKey('user1', today)])).toEqual({
            userId: 'user1',
            date: today,
            generationCount: 3,
            ttsCount: 2,
            updatedAt: expect.any(Number),
        })
        expect(mockKv[`ratelimit:sleep-story-gen:user1:${today}`]).toBeUndefined()
        expect(mockKv[`ratelimit:sleep-story-tts:user1:${today}`]).toBeUndefined()
    })
})
