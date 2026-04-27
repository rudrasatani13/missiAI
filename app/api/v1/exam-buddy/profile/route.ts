import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from '@/lib/server/security/auth'
import { getExamBuddyKV } from '@/lib/exam-buddy/kv'
import { getOrCreateProfile, getProfile, saveProfile } from '@/lib/exam-buddy/profile-store'
import type { ExamTarget } from '@/types/exam-buddy'

const updateProfileSchema = z.object({
  examTarget: z.enum([
    'jee_mains', 'jee_advanced', 'neet', 'upsc',
    'cbse_10', 'cbse_12', 'cat', 'gate',
  ]),
  targetYear: z.number().int().min(2024).max(2035).nullable().optional(),
})

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
    const profile = await getProfile(kv, userId)
    return new Response(
      JSON.stringify({ success: true, profile, isNew: !profile }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}

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

  const parsed = updateProfileSchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid request'
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  try {
    const { profile } = await getOrCreateProfile(kv, userId, parsed.data.examTarget as ExamTarget)
    profile.examTarget = parsed.data.examTarget as ExamTarget
    if (parsed.data.targetYear !== undefined) {
      profile.targetYear = parsed.data.targetYear
    }
    await saveProfile(kv, userId, profile)

    return new Response(
      JSON.stringify({ success: true, profile }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
}
