import { clerkClient } from '@clerk/nextjs/server'
import { addOrUpdateNode } from '@/lib/memory/life-graph'
import { logError, logRequest } from '@/lib/server/observability/logger'
import { rateLimitHeaders } from '@/lib/server/security/rate-limiter'
import {
  buildSetupProfile,
  getAuthenticatedSetupUserId,
  getSetupKV,
  getSetupVectorizeEnv,
  runSetupRouteRateLimitPreflight,
  setupJsonResponse,
  setupSchema,
} from '@/lib/server/routes/setup/helpers'
import type { SetupInput } from '@/lib/server/routes/setup/helpers'

async function updateSetupCompleteInClerk(userId: string): Promise<void> {
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const existingMeta = (user.publicMetadata ?? {}) as Record<string, unknown>
  await client.users.updateUser(userId, {
    publicMetadata: {
      ...existingMeta,
      setupComplete: true,
    },
  })
}

async function createSetupMemories(userId: string, input: SetupInput): Promise<void> {
  const kv = getSetupKV()
  if (!kv) {
    return
  }

  const vectorizeEnv = getSetupVectorizeEnv()

  await addOrUpdateNode(kv, vectorizeEnv, userId, {
    userId,
    title: "User's Name",
    detail: `The user's name is ${input.name}. Always address the user as ${input.name}.`,
    category: 'person',
    tags: ['identity', 'name'],
    people: [input.name],
    emotionalWeight: 1.0,
    confidence: 1.0,
    source: 'explicit',
  })

  if (input.dob && input.dob.trim().length > 0) {
    await addOrUpdateNode(kv, vectorizeEnv, userId, {
      userId,
      title: "User's Birthday",
      detail: `The user was born on ${input.dob}.`,
      category: 'event',
      tags: ['birthday', 'age', 'astrology'],
      people: [input.name],
      emotionalWeight: 0.8,
      confidence: 1.0,
      source: 'explicit',
    })
  }

  if (input.occupation && input.occupation.trim().length > 0) {
    await addOrUpdateNode(kv, vectorizeEnv, userId, {
      userId,
      title: "User's Work/Study",
      detail: `The user's occupation or primary activity is: ${input.occupation}.`,
      category: 'goal',
      tags: ['work', 'study', 'occupation'],
      people: [],
      emotionalWeight: 0.8,
      confidence: 1.0,
      source: 'explicit',
    })
  }
}

export async function runSetupPostRoute(req: Request): Promise<Response> {
  const startTime = Date.now()

  const auth = await getAuthenticatedSetupUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runSetupRouteRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) {
    return ratePreflight.response
  }

  const kv = getSetupKV()
  if (!kv) {
    logError('setup.kv_unavailable', 'KV binding missing, gracefully skipping memory save', auth.userId)
  }

  try {
    const body = await req.json()
    const parsed = setupSchema.safeParse(body)
    if (!parsed.success) {
      return setupJsonResponse({ success: false, error: 'Invalid input' }, 400)
    }

    const profile = buildSetupProfile(parsed.data)

    if (kv) {
      await kv.put(`profile:${auth.userId}`, JSON.stringify(profile))
    }

    await updateSetupCompleteInClerk(auth.userId)

    if (kv) {
      await createSetupMemories(auth.userId, parsed.data)
    }

    logRequest('setup.completed', auth.userId, startTime)
    return setupJsonResponse(
      { success: true, profile },
      200,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  } catch (error) {
    logError('setup.error', error, auth.userId)
    return setupJsonResponse(
      { success: false, error: 'Internal server error' },
      500,
      rateLimitHeaders(ratePreflight.rateResult),
    )
  }
}
