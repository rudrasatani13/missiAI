import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { getExamBuddyKV } from '@/lib/exam-buddy/kv'
import { getWeakTopics } from '@/lib/exam-buddy/profile-store'

export async function GET() {
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

  try {
    const topics = await getWeakTopics(kv, userId)
    const sorted = [...topics].sort((a, b) => b.wrongCount - a.wrongCount)
    return new Response(
      JSON.stringify({ success: true, weakTopics: sorted }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
