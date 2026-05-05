import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { getExamBuddyKV } from '@/lib/exam-buddy/kv'
import { readLocalSessionToken } from '@/lib/exam-buddy/session-token'
import {
  getQuizSession,
  saveQuizSession,
  getOrCreateProfile,
  saveProfile,
  updateWeakTopics,
} from '@/lib/exam-buddy/profile-store'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import { waitUntil } from '@/lib/server/platform/wait-until'

const submitSchema = z.object({
  answers: z.record(z.string().max(100)).refine(
    (val) => Object.keys(val).length > 0,
    'At least one answer is required',
  ),
  sessionToken: z.string().max(100000).optional(),
})

function getEncouragement(pct: number): string {
  if (pct >= 90) return 'Outstanding performance. Keep this momentum going.'
  if (pct >= 75) return 'Strong result. A little more practice and you will master this topic.'
  if (pct >= 50) return 'Solid effort. Review your weak areas and try again to build confidence.'
  return 'Every expert started as a beginner. Review the explanations, revisit the concepts, and try again.'
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response('Unauthorized', { status: 401 })
  }

  const { sessionId } = await params
  if (!sessionId || sessionId.length > 20) {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid session ID' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const kv = getExamBuddyKV()
  if (!kv) {
    return new Response(
      JSON.stringify({ success: false, error: 'Service unavailable' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid answers'
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  let session = await getQuizSession(kv, userId, sessionId)
  if (!session && process.env.NODE_ENV !== 'production' && parsed.data.sessionToken) {
    const recoveredSession = await readLocalSessionToken(parsed.data.sessionToken)
    if (recoveredSession && recoveredSession.userId === userId && recoveredSession.id === sessionId) {
      session = recoveredSession
    }
  }
  if (!session) {
    return new Response(
      JSON.stringify({ success: false, error: 'Session not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (session.completedAt !== null) {
    return new Response(
      JSON.stringify({ success: false, error: 'Quiz already submitted' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Sanitize submitted answers
  const sanitizedAnswers: Record<string, string> = {}
  for (const [qId, answer] of Object.entries(parsed.data.answers)) {
    sanitizedAnswers[sanitizeMemories(qId).slice(0, 20)] =
      sanitizeMemories(answer).slice(0, 100)
  }

  // Scoring
  let correct = 0
  let incorrect = 0
  const wrongTopics: Array<{ topic: string; subject: string }> = []

  // JEE/NEET use negative marking; others don't
  const useNegativeMarking =
    session.examTarget === 'jee_mains' ||
    session.examTarget === 'jee_advanced' ||
    session.examTarget === 'neet'
  const marksPerCorrect = 4
  const negativeMarks = useNegativeMarking ? -1 : 0

  for (const question of session.questions) {
    const userAns = sanitizedAnswers[question.id]
    if (!userAns) continue
    if (userAns.trim().toLowerCase() === question.correctAnswer.trim().toLowerCase()) {
      correct++
    } else {
      incorrect++
      wrongTopics.push({ topic: question.topic, subject: question.subject })
    }
  }

  const totalMarks = useNegativeMarking
    ? correct * marksPerCorrect + incorrect * negativeMarks
    : correct

  const attempted = correct + incorrect
  const pct = attempted > 0 ? Math.round((correct / attempted) * 100) : 0
  const encouragement = getEncouragement(pct)

  // Persist completed session
  session.userAnswers = sanitizedAnswers
  session.score = correct
  session.totalMarks = totalMarks
  session.completedAt = Date.now()
  await saveQuizSession(kv, userId, session)

  // Fire-and-forget: update weak topics and profile stats
  waitUntil(
    (async () => {
      try {
        // Update weak topics for all wrong answers in a single bulk operation
        if (wrongTopics.length > 0) {
          await updateWeakTopics(kv, userId, wrongTopics as any)
        }

        const { profile } = await getOrCreateProfile(kv, userId)
        profile.totalQuizzesCompleted += 1
        profile.totalCorrectAnswers += correct
        profile.totalQuestionsAttempted += attempted
        await saveProfile(kv, userId, profile)
      } catch {
        // never crash the response
      }
    })(),
  )

  return new Response(
    JSON.stringify({
      success: true,
      session,
      weakTopicsUpdated: wrongTopics.length,
      encouragement,
      score: { correct, incorrect, total: session.questions.length, pct, totalMarks },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
