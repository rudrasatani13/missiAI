import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: vi.fn(),
}))

vi.mock('@/lib/server/security/auth', () => ({
  getVerifiedUserId: vi.fn(),
  AuthenticationError: class AuthenticationError extends Error {
    constructor() {
      super('Unauthenticated')
      this.name = 'AuthenticationError'
    }
  },
  unauthorizedResponse: vi.fn(
    () =>
      new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
        status: 401,
      }),
  ),
}))

vi.mock('@/lib/exam-buddy/quiz-generator', () => ({
  generateQuizWithDiagnostics: vi.fn(),
}))

vi.mock('@/lib/billing/tier-checker', () => ({
  getUserPlan: vi.fn(),
}))

vi.mock('nanoid', () => {
  let c = 0
  return { nanoid: vi.fn(() => `sess-${++c}`) }
})

// ─── Imports ─────────────────────────────────────────────────────────────────

import { getCloudflareContext } from '@opennextjs/cloudflare'
import { getVerifiedUserId } from '@/lib/server/security/auth'
import { generateQuizWithDiagnostics } from '@/lib/exam-buddy/quiz-generator'
import { getUserPlan } from '@/lib/billing/tier-checker'

import { GET as GET_PROFILE, POST as POST_PROFILE } from '@/app/api/v1/exam-buddy/profile/route'
import { POST as POST_QUIZ } from '@/app/api/v1/exam-buddy/quiz/route'
import { POST as POST_SUBMIT } from '@/app/api/v1/exam-buddy/quiz/[sessionId]/submit/route'
import { GET as GET_SESSIONS } from '@/app/api/v1/exam-buddy/sessions/route'
import { GET as GET_WEAK_TOPICS } from '@/app/api/v1/exam-buddy/weak-topics/route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeKV() {
  const store = new Map<string, string>()
  return {
    get: async (k: string) => store.get(k) ?? null,
    put: async (k: string, v: string, _opts?: any) => { store.set(k, v) },
    delete: async (k: string) => { store.delete(k) },
    _store: store,
  }
}

const mockGetCtx = vi.mocked(getCloudflareContext)
const mockGetUser = vi.mocked(getVerifiedUserId)
const mockGenerateQuiz = vi.mocked(generateQuizWithDiagnostics)
const mockGetUserPlan = vi.mocked(getUserPlan)

function makeReq(body: unknown, url = 'http://localhost/api/v1/exam-buddy/profile') {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const SAMPLE_QUESTION = {
  id: 'q1abc123',
  questionText: 'What is F=ma?',
  options: ['Force', 'Mass', 'Acceleration', 'None'],
  correctAnswer: 'Force',
  explanation: 'Yeh Newton ka second law hai.',
  difficulty: 'medium' as const,
  subject: 'physics' as const,
  topic: 'Newton Laws',
  type: 'mcq' as const,
}

describe('exam-buddy API routes', () => {
  let kv: ReturnType<typeof makeKV>

  beforeEach(() => {
    vi.clearAllMocks()
    delete (globalThis as any).__MISSI_EXAM_BUDDY_LOCAL_STORE__
    kv = makeKV()
    mockGetCtx.mockReturnValue({ env: { MISSI_MEMORY: kv } } as any)
    mockGetUserPlan.mockResolvedValue('free')
  })

  // ── Profile route ─────────────────────────────────────────────────────────

  it('GET /profile returns 401 when unauthenticated', async () => {
    mockGetUser.mockRejectedValueOnce(new (vi.mocked(await import('@/lib/server/security/auth')).AuthenticationError)())
    const res = await GET_PROFILE()
    expect(res.status).toBe(401)
  })

  it('GET /profile does not auto-create a default profile for a new user', async () => {
    mockGetUser.mockResolvedValueOnce('user-new')

    const res = await GET_PROFILE()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.isNew).toBe(true)
    expect(data.profile).toBeNull()
    expect(kv._store.size).toBe(0)
  })

  it('POST /profile sets examTarget on profile and enforces userId', async () => {
    mockGetUser.mockResolvedValueOnce('user-abc')
    const req = makeReq({ examTarget: 'neet' })
    const res = await POST_PROFILE(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.profile.examTarget).toBe('neet')
    expect(data.profile.userId).toBe('user-abc')
  })

  it('POST /profile falls back to local storage when Cloudflare KV is unavailable', async () => {
    mockGetCtx.mockImplementationOnce(() => {
      throw new Error('No Cloudflare context')
    })
    mockGetUser.mockResolvedValueOnce('user-local')

    const res = await POST_PROFILE(makeReq({ examTarget: 'upsc' }))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.profile.examTarget).toBe('upsc')
    expect(data.profile.userId).toBe('user-local')
  })

  it('local Exam Buddy fallback is shared across profile, quiz, and sessions routes', async () => {
    mockGetCtx.mockImplementation(() => {
      throw new Error('No Cloudflare context')
    })

    mockGetUser.mockResolvedValueOnce('user-shared-local')
    const profileRes = await POST_PROFILE(makeReq({ examTarget: 'upsc' }))
    const profileData = await profileRes.json()

    expect(profileRes.status).toBe(200)
    expect(profileData.profile.examTarget).toBe('upsc')

    mockGenerateQuiz.mockResolvedValueOnce({ questions: [SAMPLE_QUESTION] })
    mockGetUser.mockResolvedValueOnce('user-shared-local')
    const quizRes = await POST_QUIZ(
      makeReq(
        { subject: 'geography', topic: 'Climate', difficulty: 'medium', questionCount: 1, questionTypes: ['mcq'] },
        'http://localhost/api/v1/exam-buddy/quiz',
      ),
    )
    const quizData = await quizRes.json()

    expect(quizRes.status).toBe(200)
    expect(quizData.success).toBe(true)
    expect(quizData.session.examTarget).toBe('upsc')

    mockGetUser.mockResolvedValueOnce('user-shared-local')
    const sessionsRes = await GET_SESSIONS(new NextRequest('http://localhost/api/v1/exam-buddy/sessions?limit=5'))
    const sessionsData = await sessionsRes.json()

    expect(sessionsRes.status).toBe(200)
    expect(sessionsData.success).toBe(true)
    expect(sessionsData.sessions).toHaveLength(1)
    expect(sessionsData.sessions[0].examTarget).toBe('upsc')
  })

  // ── Quiz route ────────────────────────────────────────────────────────────

  it('POST /quiz returns 401 when unauthenticated', async () => {
    mockGetUser.mockRejectedValueOnce(new (vi.mocked(await import('@/lib/server/security/auth')).AuthenticationError)())
    const req = makeReq({ subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 3, questionTypes: ['mcq'] }, 'http://localhost/api/v1/exam-buddy/quiz')
    const res = await POST_QUIZ(req)
    expect(res.status).toBe(401)
  })

  it('POST /quiz returns 429 after the free hourly quiz limit is exceeded', async () => {
    mockGetUser.mockResolvedValue('user-rl')
    mockGenerateQuiz.mockResolvedValue({ questions: [SAMPLE_QUESTION] })

    const hour = Math.floor(Date.now() / 3_600_000)
    kv._store.set(`ratelimit:exam-buddy-quiz:hour:user-rl:${hour}`, '3')

    const req = makeReq(
      { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 1, questionTypes: ['mcq'] },
      'http://localhost/api/v1/exam-buddy/quiz',
    )
    const res = await POST_QUIZ(req)
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(data.window).toBe('hour')
    expect(data.planId).toBe('free')
  })

  it('POST /quiz returns 403 when free question count exceeds the plan cap', async () => {
    mockGetUser.mockResolvedValueOnce('user-free-cap')

    const req = makeReq(
      { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 6, questionTypes: ['mcq'] },
      'http://localhost/api/v1/exam-buddy/quiz',
    )
    const res = await POST_QUIZ(req)
    const data = await res.json()

    expect(res.status).toBe(403)
    expect(data.code).toBe('PLAN_LIMIT_EXCEEDED')
    expect(data.maxQuestionsPerQuiz).toBe(5)
  })

  it('POST /quiz allows plus users to generate 10-question quizzes', async () => {
    mockGetUserPlan.mockResolvedValueOnce('plus')
    mockGetUser.mockResolvedValueOnce('user-plus')
    mockGenerateQuiz.mockResolvedValueOnce({
      questions: Array.from({ length: 10 }, (_, index) => ({
        ...SAMPLE_QUESTION,
        id: `q-plus-${index + 1}`,
      })),
    })

    const req = makeReq(
      { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 10, questionTypes: ['mcq'] },
      'http://localhost/api/v1/exam-buddy/quiz',
    )
    const res = await POST_QUIZ(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockGenerateQuiz).toHaveBeenCalledWith('physics', 'Newton', 'easy', 10, 'cbse_12', ['mcq'])
  })

  it('POST /quiz returns 429 after the plus daily quiz limit is exceeded', async () => {
    mockGetUserPlan.mockResolvedValueOnce('plus')
    mockGetUser.mockResolvedValueOnce('user-plus-daily')
    mockGenerateQuiz.mockResolvedValue({ questions: [SAMPLE_QUESTION] })

    const today = new Date().toISOString().slice(0, 10)
    kv._store.set(`ratelimit:exam-buddy-quiz:day:user-plus-daily:${today}`, '30')

    const req = makeReq(
      { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 1, questionTypes: ['mcq'] },
      'http://localhost/api/v1/exam-buddy/quiz',
    )
    const res = await POST_QUIZ(req)
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(data.window).toBe('day')
    expect(data.planId).toBe('plus')
  })

  it('POST /quiz returns 429 after the pro monthly quiz limit is exceeded', async () => {
    mockGetUserPlan.mockResolvedValueOnce('pro')
    mockGetUser.mockResolvedValueOnce('user-pro-monthly')
    mockGenerateQuiz.mockResolvedValue({ questions: [SAMPLE_QUESTION] })

    const now = new Date()
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    kv._store.set(`ratelimit:exam-buddy-quiz:month:user-pro-monthly:${month}`, '2000')

    const req = makeReq(
      { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 1, questionTypes: ['mcq'] },
      'http://localhost/api/v1/exam-buddy/quiz',
    )
    const res = await POST_QUIZ(req)
    const data = await res.json()

    expect(res.status).toBe(429)
    expect(data.window).toBe('month')
    expect(data.planId).toBe('pro')
  })

  it('POST /quiz response does NOT include correctAnswer or explanation', async () => {
    mockGetUser.mockResolvedValueOnce('user-quiz')
    mockGenerateQuiz.mockResolvedValueOnce({ questions: [SAMPLE_QUESTION] })

    const req = makeReq(
      { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 1, questionTypes: ['mcq'] },
      'http://localhost/api/v1/exam-buddy/quiz',
    )
    const res = await POST_QUIZ(req)
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    const questions = data.session.questions
    expect(questions[0]).not.toHaveProperty('correctAnswer')
    expect(questions[0]).not.toHaveProperty('explanation')
  })

  it('local fallback lets POST /quiz/:id/submit find a generated session with async params', async () => {
    mockGetCtx.mockImplementation(() => {
      throw new Error('No Cloudflare context')
    })
    mockGenerateQuiz.mockResolvedValueOnce({ questions: [SAMPLE_QUESTION] })

    mockGetUser.mockResolvedValueOnce('user-submit-local')
    const quizRes = await POST_QUIZ(
      makeReq(
        { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 1, questionTypes: ['mcq'] },
        'http://localhost/api/v1/exam-buddy/quiz',
      ),
    )
    const quizData = await quizRes.json()

    expect(quizRes.status).toBe(200)
    expect(quizData.success).toBe(true)

    mockGetUser.mockResolvedValueOnce('user-submit-local')
    const submitReq = new NextRequest(`http://localhost/api/v1/exam-buddy/quiz/${quizData.session.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1abc123: 'Force' } }),
    })
    const submitRes = await POST_SUBMIT(submitReq, {
      params: Promise.resolve({ sessionId: quizData.session.id }),
    })
    const submitData = await submitRes.json()

    expect(submitRes.status).toBe(200)
    expect(submitData.success).toBe(true)
    expect(submitData.session.id).toBe(quizData.session.id)
    expect(submitData.session.questions[0]).toHaveProperty('correctAnswer')
  })

  it('local submit can recover from sessionToken when dev server memory is lost', async () => {
    mockGetCtx.mockImplementation(() => {
      throw new Error('No Cloudflare context')
    })
    mockGenerateQuiz.mockResolvedValueOnce({ questions: [SAMPLE_QUESTION] })

    mockGetUser.mockResolvedValueOnce('user-submit-token')
    const quizRes = await POST_QUIZ(
      makeReq(
        { subject: 'physics', topic: 'Newton', difficulty: 'easy', questionCount: 1, questionTypes: ['mcq'] },
        'http://localhost/api/v1/exam-buddy/quiz',
      ),
    )
    const quizData = await quizRes.json()

    expect(quizRes.status).toBe(200)
    expect(typeof quizData.localSessionToken).toBe('string')

    delete (globalThis as any).__MISSI_EXAM_BUDDY_LOCAL_STORE__

    mockGetUser.mockResolvedValueOnce('user-submit-token')
    const submitReq = new NextRequest(`http://localhost/api/v1/exam-buddy/quiz/${quizData.session.id}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1abc123: 'Force' }, sessionToken: quizData.localSessionToken }),
    })
    const submitRes = await POST_SUBMIT(submitReq, {
      params: Promise.resolve({ sessionId: quizData.session.id }),
    })
    const submitData = await submitRes.json()

    expect(submitRes.status).toBe(200)
    expect(submitData.success).toBe(true)
    expect(submitData.session.id).toBe(quizData.session.id)
  })

  // ── Submit route ──────────────────────────────────────────────────────────

  it('POST /quiz/:id/submit returns 401 when unauthenticated', async () => {
    mockGetUser.mockRejectedValueOnce(new (vi.mocked(await import('@/lib/server/security/auth')).AuthenticationError)())
    const req = new NextRequest('http://localhost/api/v1/exam-buddy/quiz/sess-1/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1: 'A' } }),
    })
    const res = await POST_SUBMIT(req, { params: Promise.resolve({ sessionId: 'sess-1' }) })
    expect(res.status).toBe(401)
  })

  it('POST /quiz/:id/submit returns 404 for session belonging to different user', async () => {
    mockGetUser.mockResolvedValue('user-other')
    const req = new NextRequest('http://localhost/api/v1/exam-buddy/quiz/unknown-sess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1: 'Force' } }),
    })
    const res = await POST_SUBMIT(req, { params: Promise.resolve({ sessionId: 'unknown-sess' }) })
    expect(res.status).toBe(404)
  })

  it('POST /quiz/:id/submit returns 400 if already submitted', async () => {
    mockGetUser.mockResolvedValue('user-done')
    // Seed a completed session
    const completedSession = {
      id: 'completed-sess',
      userId: 'user-done',
      examTarget: 'cbse_12',
      subject: 'physics',
      topic: 'Newton',
      difficulty: 'easy',
      questions: [SAMPLE_QUESTION],
      userAnswers: { q1abc123: 'Force' },
      score: 1,
      totalMarks: 1,
      completedAt: Date.now() - 1000,
      createdAt: Date.now() - 2000,
    }
    kv._store.set('exam-buddy:session:user-done:completed-sess', JSON.stringify(completedSession))

    const req = new NextRequest('http://localhost/api/v1/exam-buddy/quiz/completed-sess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1abc123: 'Force' } }),
    })
    const res = await POST_SUBMIT(req, { params: Promise.resolve({ sessionId: 'completed-sess' }) })
    expect(res.status).toBe(400)
  })

  it('POST /quiz/:id/submit returns correctAnswer and explanation after submission', async () => {
    mockGetUser.mockResolvedValue('user-submit')
    const session = {
      id: 'active-sess',
      userId: 'user-submit',
      examTarget: 'cbse_12',
      subject: 'physics',
      topic: 'Newton',
      difficulty: 'easy',
      questions: [SAMPLE_QUESTION],
      userAnswers: {},
      score: null,
      totalMarks: null,
      completedAt: null,
      createdAt: Date.now(),
    }
    kv._store.set('exam-buddy:session:user-submit:active-sess', JSON.stringify(session))

    const req = new NextRequest('http://localhost/api/v1/exam-buddy/quiz/active-sess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1abc123: 'Force' } }),
    })
    const res = await POST_SUBMIT(req, { params: Promise.resolve({ sessionId: 'active-sess' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.session.questions[0]).toHaveProperty('correctAnswer')
    expect(data.session.questions[0]).toHaveProperty('explanation')
  })

  it('POST /quiz/:id/submit applies negative marking for JEE', async () => {
    mockGetUser.mockResolvedValue('user-jee')
    const jeeSession = {
      id: 'jee-sess',
      userId: 'user-jee',
      examTarget: 'jee_mains',
      subject: 'physics',
      topic: 'Newton',
      difficulty: 'medium',
      questions: [
        { ...SAMPLE_QUESTION, id: 'q1' },
        { ...SAMPLE_QUESTION, id: 'q2', correctAnswer: 'Mass' },
      ],
      userAnswers: {},
      score: null,
      totalMarks: null,
      completedAt: null,
      createdAt: Date.now(),
    }
    kv._store.set('exam-buddy:session:user-jee:jee-sess', JSON.stringify(jeeSession))

    // Answer q1 correctly (Force = Force), q2 wrong (Force ≠ Mass)
    const req = new NextRequest('http://localhost/api/v1/exam-buddy/quiz/jee-sess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { q1: 'Force', q2: 'Force' } }),
    })
    const res = await POST_SUBMIT(req, { params: Promise.resolve({ sessionId: 'jee-sess' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    // 1 correct (+4) + 1 wrong (-1) = 3
    expect(data.score.totalMarks).toBe(3)
  })

  it('POST /quiz/:id/submit updates weak topics for wrong answers', async () => {
    mockGetUser.mockResolvedValue('user-weak')
    const session = {
      id: 'weak-sess',
      userId: 'user-weak',
      examTarget: 'cbse_12',
      subject: 'physics',
      topic: 'Thermodynamics',
      difficulty: 'medium',
      questions: [{ ...SAMPLE_QUESTION, id: 'qw1', correctAnswer: 'RightAnswer', topic: 'Thermodynamics', subject: 'physics' }],
      userAnswers: {},
      score: null,
      totalMarks: null,
      completedAt: null,
      createdAt: Date.now(),
    }
    kv._store.set('exam-buddy:session:user-weak:weak-sess', JSON.stringify(session))

    const req = new NextRequest('http://localhost/api/v1/exam-buddy/quiz/weak-sess/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers: { qw1: 'WrongAnswer' } }),
    })
    const res = await POST_SUBMIT(req, { params: Promise.resolve({ sessionId: 'weak-sess' }) })
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.weakTopicsUpdated).toBe(1)
  })

  it('GET /weak-topics returns 401 when unauthenticated', async () => {
    mockGetUser.mockRejectedValueOnce(new (vi.mocked(await import('@/lib/server/security/auth')).AuthenticationError)())
    const res = await GET_WEAK_TOPICS()
    expect(res.status).toBe(401)
  })

  it('GET /weak-topics falls back to local storage when Cloudflare KV is unavailable', async () => {
    mockGetCtx.mockImplementation(() => {
      throw new Error('No Cloudflare context')
    })
    mockGetUser.mockResolvedValueOnce('user-local-weak-topics')

    const res = await GET_WEAK_TOPICS()
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.weakTopics).toEqual([])
  })
})
