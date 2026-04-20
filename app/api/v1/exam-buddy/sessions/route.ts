import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/auth'
import { getExamBuddyKV } from '@/lib/exam-buddy/kv'
import { getRecentSessions } from '@/lib/exam-buddy/profile-store'

export const runtime = 'edge'

const limitSchema = z.coerce.number().int().min(1).max(50).default(10)

export async function GET(req: NextRequest) {
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

  const rawLimit = req.nextUrl.searchParams.get('limit') ?? '10'
  const limitParsed = limitSchema.safeParse(rawLimit)
  const limit = limitParsed.success ? limitParsed.data : 10

  try {
    const sessions = await getRecentSessions(kv, userId, limit)

    // Strip answer keys from questions in response
    const sanitized = sessions.map((s) => ({
      ...s,
      questions: s.questions.map(({ correctAnswer: _ca, explanation: _ex, ...rest }) => rest),
    }))

    return new Response(
      JSON.stringify({ success: true, sessions: sanitized }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
