import { NextRequest } from 'next/server'
import { z } from 'zod'
// @ts-ignore
import { nanoid } from 'nanoid'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { getExamBuddyKV } from '@/lib/exam-buddy/kv'
import { checkAndIncrementQuizGenerationLimit, getExamBuddyPlanLimits } from '@/lib/exam-buddy/limits'
import { getOrCreateProfile } from '@/lib/exam-buddy/profile-store'
import { generateQuizWithDiagnostics } from '@/lib/exam-buddy/quiz-generator'
import { saveQuizSession } from '@/lib/exam-buddy/profile-store'
import { createLocalSessionToken } from '@/lib/exam-buddy/session-token'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import { PLANS } from '@/types/billing'
import type { ExamTarget, ExamSubject, QuizDifficulty, QuizQuestionType, QuizSession } from '@/types/exam-buddy'

const quizRequestSchema = z.object({
  subject: z.enum([
    'physics', 'chemistry', 'mathematics', 'biology', 'history',
    'geography', 'polity', 'economics', 'english', 'general_studies', 'aptitude',
  ]),
  topic: z.string().min(1, 'Topic required').max(100, 'Topic too long'),
  difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).default('medium'),
  questionCount: z.number().int().min(1).max(20).default(5),
  questionTypes: z
    .array(z.enum(['mcq', 'true_false', 'numerical']))
    .min(1)
    .default(['mcq']),
})

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response('Unauthorized', { status: 401 })
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

  const parsed = quizRequestSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const planId = await getUserPlan(userId)
  const planLimits = getExamBuddyPlanLimits(planId)
  if (parsed.data.questionCount > planLimits.maxQuestionsPerQuiz) {
    return new Response(
      JSON.stringify({
        success: false,
        error: `${PLANS[planId].name} plan supports up to ${planLimits.maxQuestionsPerQuiz} questions per quiz. Upgrade to unlock longer quizzes.`,
        code: 'PLAN_LIMIT_EXCEEDED',
        planId,
        maxQuestionsPerQuiz: planLimits.maxQuestionsPerQuiz,
        upgrade: '/pricing',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const rateLimit = await checkAndIncrementQuizGenerationLimit(kv, userId, planId)
  if (!rateLimit.allowed) {
    const exceededWindow = rateLimit.exceededWindow ?? 'hour'
    const limit = exceededWindow === 'hour'
      ? rateLimit.limits.quizGenerationsPerHour
      : exceededWindow === 'day'
      ? rateLimit.limits.quizGenerationsPerDay
      : rateLimit.limits.quizGenerationsPerMonth
    const error = exceededWindow === 'hour'
      ? `Hourly quiz generation limit reached on the ${PLANS[planId].name} plan. Please try again soon.`
      : exceededWindow === 'day'
      ? `Daily quiz generation limit reached on the ${PLANS[planId].name} plan. Upgrade for more quizzes.`
      : `Monthly quiz generation limit reached on the ${PLANS[planId].name} plan. Upgrade for more quizzes.`

    return new Response(
      JSON.stringify({
        success: false,
        error,
        code: 'RATE_LIMIT_EXCEEDED',
        planId,
        window: exceededWindow,
        limit,
        remaining: 0,
        upgrade: '/pricing',
      }),
      { status: 429, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Get user profile for exam context
  const { profile } = await getOrCreateProfile(kv, userId)

  // Sanitize topic
  const safeTopic = sanitizeMemories(parsed.data.topic).slice(0, 100)

  // Generate quiz
  const { questions, reason, detail } = await generateQuizWithDiagnostics(
    parsed.data.subject as ExamSubject,
    safeTopic,
    parsed.data.difficulty as QuizDifficulty,
    parsed.data.questionCount,
    profile.examTarget as ExamTarget,
    parsed.data.questionTypes as QuizQuestionType[],
  )

  if (questions.length === 0) {
    console.warn('[ExamBuddy] /quiz generation failed', {
      userId,
      subject: parsed.data.subject,
      topic: safeTopic,
      examTarget: profile.examTarget,
      reason,
      detail,
    })
    const userMessage =
      reason === 'timeout'
        ? 'The quiz generator timed out. Please try again.'
        : reason === 'provider_error'
        ? 'The AI provider is unavailable right now. Please try again in a moment.'
        : reason === 'empty_response' || reason === 'unparseable_response'
        ? 'The AI returned an unexpected response. Please try again or rephrase your topic.'
        : 'Could not generate a quiz for this topic. Try a more specific topic or try again.'
    return new Response(
      JSON.stringify({
        success: false,
        error: userMessage,
        reason: reason ?? 'no_valid_questions',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const session: QuizSession = {
    id: nanoid(12),
    userId,
    examTarget: profile.examTarget,
    subject: parsed.data.subject as ExamSubject,
    topic: safeTopic,
    difficulty: parsed.data.difficulty as QuizDifficulty,
    questions,
    userAnswers: {},
    score: null,
    totalMarks: null,
    completedAt: null,
    createdAt: Date.now(),
    xpEarned: 0,
  }

  await saveQuizSession(kv, userId, session)

  const sanitizedQuestions = session.questions.map(({ correctAnswer: _ca, explanation: _ex, ...rest }) => rest)
  const responseBody: {
    success: true
    session: Omit<QuizSession, 'questions'> & { questions: typeof sanitizedQuestions }
    localSessionToken?: string
  } = {
    success: true,
    session: { ...session, questions: sanitizedQuestions },
  }

  if (process.env.NODE_ENV !== 'production') {
    responseBody.localSessionToken = await createLocalSessionToken(session)
  }

  return new Response(
    JSON.stringify(responseBody),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
}
