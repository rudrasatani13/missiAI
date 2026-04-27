import { getRecentSessions, saveQuizSession } from '../../lib/exam-buddy/profile-store'
import type { KVStore } from '../../types'
import type { QuizSession } from '../../types/exam-buddy'

function makeKV(delayMs = 10): KVStore {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => {
      await new Promise((r) => setTimeout(r, delayMs))
      return store.get(k) ?? null
    },
    put: async (k: string, v: string) => {
      await new Promise((r) => setTimeout(r, delayMs))
      store.set(k, v)
    },
    delete: async (k: string) => {
      await new Promise((r) => setTimeout(r, delayMs))
      store.delete(k)
    },
  } as KVStore
}

async function run() {
  const kv = makeKV(10) // 10ms latency
  const userId = 'bench-user'

  // Pre-populate 50 sessions
  for (let i = 0; i < 50; i++) {
    const session: QuizSession = {
      id: `session-${i}`,
      userId,
      questions: [],
      score: 0,
      startedAt: Date.now(),
    } as any
    await saveQuizSession(kv, userId, session)
  }

  // Benchmark getRecentSessions
  const start = performance.now()
  const limit = 50
  const sessions = await getRecentSessions(kv, userId, limit)
  const end = performance.now()

  console.log(`Fetched ${sessions.length} sessions in ${end - start}ms`)
}

run().catch(console.error)
