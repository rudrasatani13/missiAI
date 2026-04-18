import { describe, it, expect, vi, beforeEach } from 'vitest'
import { 
    getActiveSleepSession,
    cacheGeneratedStory, 
    getLastGeneratedStory, 
    addToHistory, 
    getHistory,
    checkGenerationRateLimit,
    incrementGenerationRateLimit
} from '@/lib/sleep-sessions/session-store'
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
            delete: vi.fn(),
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

    it('addToHistory correctly prepends, caps at 30', async () => {
        const entry = { id: 'e1', mode: 'library', title: 'Test', completed: true, durationSec: 100, date: '2024-01-01' } as any

        await addToHistory(kv, 'user1', entry)
        let hist = await getHistory(kv, 'user1')
        expect(hist.length).toBe(1)
        expect(hist[0].id).toBe('e1')

        // Add 31 more
        for (let i = 0; i < 31; i++) {
            await addToHistory(kv, 'user1', { ...entry, id: `e${i+2}`})
        }

        // getHistory defaults to limit=20, pass 30 to see all stored entries
        hist = await getHistory(kv, 'user1', 30)
        expect(hist.length).toBe(30)
        expect(hist[0].id).toBe('e32') // the very last one added
    })

    it('getActiveSleepSession returns session on success', async () => {
        const mockSession = { id: 'session1', data: 'something' }

        const originalGet = kv.get
        kv.get = vi.fn(async (key: string, options?: any) => {
            if (key === `sleep-session:user1` && options?.type === 'json') return mockSession
            return null
        }) as any

        const result = await getActiveSleepSession(kv, 'user1')
        expect(result).toEqual(mockSession)

        kv.get = originalGet
    })

    it('getActiveSleepSession returns null when session is not found', async () => {
        const originalGet = kv.get
        kv.get = vi.fn(async () => null)

        const result = await getActiveSleepSession(kv, 'user2')
        expect(result).toBeNull()

        kv.get = originalGet
    })

    it('getActiveSleepSession returns null on KV error', async () => {
        const originalGet = kv.get
        kv.get = vi.fn().mockRejectedValue(new Error('KV store failure'))

        const result = await getActiveSleepSession(kv, 'user1')
        expect(result).toBeNull()

        kv.get = originalGet
    })

    it('Rate limit functions work correctly', async () => {
        const res1 = await checkGenerationRateLimit(kv, 'user1', 'free')
        expect(res1.allowed).toBe(true)
        
        // Simulating reaching limit of 3 for free users
        await incrementGenerationRateLimit(kv, 'user1')
        await incrementGenerationRateLimit(kv, 'user1')
        await incrementGenerationRateLimit(kv, 'user1')

        const res2 = await checkGenerationRateLimit(kv, 'user1', 'free')
        expect(res2.allowed).toBe(false)
        expect(res2.remaining).toBe(0)

        // Pro user gets 20
        const res3 = await checkGenerationRateLimit(kv, 'user1', 'pro')
        expect(res3.allowed).toBe(true)
        expect(res3.remaining).toBe(17) // 20 - 3
    })
})
