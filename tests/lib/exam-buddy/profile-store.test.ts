import { describe, it, expect, beforeEach } from 'vitest'
import {
  getProfile,
  saveProfile,
  getOrCreateProfile,
  updateWeakTopic,
  updateStudyStreak,
  createDefaultProfile,
} from '@/lib/exam-buddy/profile-store'
import type { KVStore } from '@/types'

function makeKV(): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string) => { store.set(k, v) },
    delete: async (k: string) => { store.delete(k) },
  } as KVStore
}

describe('exam-buddy profile-store', () => {
  let kv: KVStore

  beforeEach(() => {
    kv = makeKV()
  })

  it('getProfile returns null for new user', async () => {
    const profile = await getProfile(kv, 'user-1')
    expect(profile).toBeNull()
  })

  it('saveProfile always sets userId to the provided userId', async () => {
    const profile = createDefaultProfile('user-1', 'jee_mains')
    // Tamper with userId — should be overwritten on save
    ;(profile as any).userId = 'attacker-id'
    await saveProfile(kv, 'user-1', profile)

    const saved = await getProfile(kv, 'user-1')
    expect(saved).not.toBeNull()
    expect(saved!.userId).toBe('user-1')
  })

  it('getOrCreateProfile creates a default profile for new user', async () => {
    const { profile, isNew } = await getOrCreateProfile(kv, 'user-2', 'neet')
    expect(isNew).toBe(true)
    expect(profile.examTarget).toBe('neet')
    expect(profile.totalQuizzesCompleted).toBe(0)
  })

  it('updateWeakTopic increments wrongCount for existing topic', async () => {
    await updateWeakTopic(kv, 'user-3', 'Newton Laws', 'physics')
    await updateWeakTopic(kv, 'user-3', 'Newton Laws', 'physics')

    const raw = await kv.get('exam-buddy:weak-topics:user-3')
    const records = JSON.parse(raw!)
    const topic = records.find((r: any) => r.topic === 'Newton Laws')
    expect(topic.wrongCount).toBe(2)
  })

  it('updateWeakTopic creates new record for new topic', async () => {
    await updateWeakTopic(kv, 'user-4', 'Photosynthesis', 'biology')

    const raw = await kv.get('exam-buddy:weak-topics:user-4')
    const records = JSON.parse(raw!)
    expect(records).toHaveLength(1)
    expect(records[0].subject).toBe('biology')
    expect(records[0].wrongCount).toBe(1)
  })

  it('updateWeakTopic keeps max 20 records, sorted by wrongCount', async () => {
    // Create 25 different topics
    for (let i = 1; i <= 25; i++) {
      for (let j = 0; j < i; j++) {
        await updateWeakTopic(kv, 'user-5', `Topic ${i}`, 'mathematics')
      }
    }

    const raw = await kv.get('exam-buddy:weak-topics:user-5')
    const records = JSON.parse(raw!)
    expect(records.length).toBeLessThanOrEqual(20)
    // Should be sorted descending by wrongCount
    for (let i = 0; i < records.length - 1; i++) {
      expect(records[i].wrongCount).toBeGreaterThanOrEqual(records[i + 1].wrongCount)
    }
  })

  it('updateStudyStreak increments on consecutive days', () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = (() => {
      const d = new Date()
      d.setDate(d.getDate() - 1)
      return d.toISOString().slice(0, 10)
    })()

    const profile = createDefaultProfile('user-6', 'cbse_12')
    profile.lastStudyDate = yesterday
    profile.studyStreak = 3

    updateStudyStreak(profile)

    expect(profile.studyStreak).toBe(4)
    expect(profile.lastStudyDate).toBe(today)
  })

  it('updateStudyStreak resets streak on gap', () => {
    const twoDaysAgo = (() => {
      const d = new Date()
      d.setDate(d.getDate() - 2)
      return d.toISOString().slice(0, 10)
    })()

    const profile = createDefaultProfile('user-7', 'upsc')
    profile.lastStudyDate = twoDaysAgo
    profile.studyStreak = 10

    updateStudyStreak(profile)

    expect(profile.studyStreak).toBe(1)
  })
})
