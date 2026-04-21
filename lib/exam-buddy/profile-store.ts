// ─── Exam Buddy Profile & Session Store ──────────────────────────────────────

import type { KVStore } from '@/types'
import type {
  ExamBuddyProfile,
  ExamTarget,
  QuizSession,
  WeakTopicRecord,
  ExamSubject,
} from '@/types/exam-buddy'

// ─── KV Key Builders ──────────────────────────────────────────────────────────

const profileKey = (userId: string) => `exam-buddy:profile:${userId}`
const sessionKey = (userId: string, sessionId: string) =>
  `exam-buddy:session:${userId}:${sessionId}`
const sessionsIndexKey = (userId: string) =>
  `exam-buddy:sessions-index:${userId}`
const weakTopicsKey = (userId: string) => `exam-buddy:weak-topics:${userId}`

const SESSION_TTL = 604800   // 7 days
const MAX_SESSION_INDEX = 50
const MAX_WEAK_TOPICS = 20
const MAX_SESSION_BYTES = 50_000  // 50 KB

// ─── Default Profile Factory ──────────────────────────────────────────────────

export function createDefaultProfile(userId: string, examTarget: ExamTarget): ExamBuddyProfile {
  const now = Date.now()
  return {
    userId,
    examTarget,
    targetYear: null,
    weakSubjects: [],
    studyStreak: 0,
    lastStudyDate: '',
    totalQuizzesCompleted: 0,
    totalCorrectAnswers: 0,
    totalQuestionsAttempted: 0,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── Profile CRUD ─────────────────────────────────────────────────────────────

export async function getProfile(
  kv: KVStore,
  userId: string,
): Promise<ExamBuddyProfile | null> {
  const raw = await kv.get(profileKey(userId))
  if (!raw) return null
  try {
    return JSON.parse(raw) as ExamBuddyProfile
  } catch {
    return null
  }
}

export async function saveProfile(
  kv: KVStore,
  userId: string,
  profile: ExamBuddyProfile,
): Promise<void> {
  profile.userId = userId  // always enforce ownership
  profile.updatedAt = Date.now()
  await kv.put(profileKey(userId), JSON.stringify(profile))
}

export async function getOrCreateProfile(
  kv: KVStore,
  userId: string,
  examTarget: ExamTarget = 'cbse_12',
): Promise<{ profile: ExamBuddyProfile; isNew: boolean }> {
  const existing = await getProfile(kv, userId)
  if (existing) return { profile: existing, isNew: false }
  const fresh = createDefaultProfile(userId, examTarget)
  await saveProfile(kv, userId, fresh)
  return { profile: fresh, isNew: true }
}

// ─── Study Streak ─────────────────────────────────────────────────────────────

export function updateStudyStreak(profile: ExamBuddyProfile): void {
  const today = new Date().toISOString().slice(0, 10)
  if (profile.lastStudyDate === today) return

  const todayDate = new Date(today)
  const yesterdayDate = new Date(todayDate)
  yesterdayDate.setDate(todayDate.getDate() - 1)
  const yesterday = yesterdayDate.toISOString().slice(0, 10)

  if (profile.lastStudyDate === yesterday) {
    profile.studyStreak += 1
  } else {
    profile.studyStreak = 1
  }

  profile.lastStudyDate = today
}

// ─── Weak Topics ──────────────────────────────────────────────────────────────

export async function getWeakTopics(
  kv: KVStore,
  userId: string,
): Promise<WeakTopicRecord[]> {
  const raw = await kv.get(weakTopicsKey(userId))
  if (!raw) return []
  try {
    return JSON.parse(raw) as WeakTopicRecord[]
  } catch {
    return []
  }
}

export async function updateWeakTopic(
  kv: KVStore,
  userId: string,
  topic: string,
  subject: ExamSubject,
): Promise<void> {
  const records = await getWeakTopics(kv, userId)
  const existing = records.find(
    (r) => r.topic.toLowerCase() === topic.toLowerCase() && r.subject === subject,
  )
  if (existing) {
    existing.wrongCount += 1
    existing.lastAttemptedAt = Date.now()
  } else {
    records.push({ topic, subject, wrongCount: 1, lastAttemptedAt: Date.now() })
  }

  // Keep top MAX_WEAK_TOPICS by wrongCount
  records.sort((a, b) => b.wrongCount - a.wrongCount)
  const trimmed = records.slice(0, MAX_WEAK_TOPICS)

  await kv.put(weakTopicsKey(userId), JSON.stringify(trimmed))
}

// ─── Quiz Sessions ────────────────────────────────────────────────────────────

export async function saveQuizSession(
  kv: KVStore,
  userId: string,
  session: QuizSession,
): Promise<void> {
  // Enforce ownership
  session.userId = userId

  const payload = JSON.stringify(session)
  if (payload.length > MAX_SESSION_BYTES) {
    throw new Error('Quiz session too large to save')
  }

  await kv.put(sessionKey(userId, session.id), payload, {
    expirationTtl: SESSION_TTL,
  })

  // Update sessions index
  const rawIndex = await kv.get(sessionsIndexKey(userId))
  const index: string[] = rawIndex ? JSON.parse(rawIndex) : []
  // Move to front, remove duplicate if exists
  const filtered = index.filter((id) => id !== session.id)
  filtered.unshift(session.id)
  // Trim to limit
  const trimmed = filtered.slice(0, MAX_SESSION_INDEX)
  await kv.put(sessionsIndexKey(userId), JSON.stringify(trimmed))
}

export async function getQuizSession(
  kv: KVStore,
  userId: string,
  sessionId: string,
): Promise<QuizSession | null> {
  const raw = await kv.get(sessionKey(userId, sessionId))
  if (!raw) return null
  try {
    const session = JSON.parse(raw) as QuizSession
    // Ownership check
    if (session.userId !== userId) return null
    return session
  } catch {
    return null
  }
}

export async function getRecentSessions(
  kv: KVStore,
  userId: string,
  limit = 10,
): Promise<QuizSession[]> {
  const rawIndex = await kv.get(sessionsIndexKey(userId))
  if (!rawIndex) return []

  const index: string[] = JSON.parse(rawIndex)
  const ids = index.slice(0, Math.min(limit, MAX_SESSION_INDEX))

  const sessionPromises = ids.map(async (id) => {
    try {
      return await getQuizSession(kv, userId, id)
    } catch {
      return null
    }
  })
  const fetchedSessions = await Promise.all(sessionPromises)
  const sessions: QuizSession[] = fetchedSessions.filter((s): s is QuizSession => s !== null)
  return sessions
}
