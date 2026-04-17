// ─── Quest API Routes — List & Generate ───────────────────────────────────────

import { NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { stripHtml } from '@/lib/validation/sanitizer'
import { validationErrorResponse } from '@/lib/validation/schemas'
import { checkRateLimit, rateLimitExceededResponse, rateLimitHeaders } from '@/lib/rateLimiter'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { logRequest, logError } from '@/lib/server/logger'
import { generateQuest } from '@/lib/quests/quest-generator'
import {
  getQuests,
  addQuest,
  getActiveQuestCount,
  checkQuestGenRateLimit,
  incrementQuestGenRateLimit,
} from '@/lib/quests/quest-store'
import { addOrUpdateNode } from '@/lib/memory/life-graph'
import { searchLifeGraph } from '@/lib/memory/life-graph'
import type { KVStore } from '@/types'
import type { QuestGenerationInput, QuestCategory, QuestDifficulty } from '@/types/quests'
import type { VectorizeEnv } from '@/lib/memory/vectorize'

export const runtime = 'edge'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getRequestContext()
    const e = env as Record<string, unknown>
    if (e.VECTORIZE_INDEX) {
      return env as unknown as VectorizeEnv
    }
    return null
  } catch {
    return null
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createQuestSchema = z.object({
  userGoal: z.string().min(10).max(500),
  category: z.enum([
    'health', 'learning', 'creativity', 'relationships',
    'career', 'mindfulness', 'other',
  ]),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  targetDurationDays: z.number().int().min(3).max(180),
})

// ─── GET — List all quests ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('quests.list.auth_error', e)
    throw e
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: true, quests: [], activeCount: 0 },
      200,
      rateLimitHeaders(rateResult),
    )
  }

  try {
    const quests = await getQuests(kv, userId)

    // Optional status filter
    const statusFilter = req.nextUrl.searchParams.get('status')
    let filtered = quests
    if (statusFilter === 'active') {
      filtered = quests.filter(q => q.status === 'active')
    } else if (statusFilter === 'completed') {
      filtered = quests.filter(q => q.status === 'completed')
    }

    const activeCount = quests.filter(q => q.status === 'active').length

    logRequest('quests.list', userId, startTime)
    return jsonResponse(
      { success: true, quests: filtered, activeCount },
      200,
      rateLimitHeaders(rateResult),
    )
  } catch (err) {
    logError('quests.list.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Failed to load quests' },
      500,
      rateLimitHeaders(rateResult),
    )
  }
}

// ─── POST — Generate a new quest ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('quests.create.auth_error', e)
    throw e
  }

  const planId = await getUserPlan(userId)
  const rateTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier)
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Storage unavailable' },
      503,
    )
  }

  // Parse and validate body
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const parsed = createQuestSchema.safeParse(body)
  if (!parsed.success) return validationErrorResponse(parsed.error)

  // Rate limit check for quest generation
  const genRateLimit = await checkQuestGenRateLimit(kv, userId, planId)
  if (!genRateLimit.allowed) {
    return jsonResponse(
      {
        success: false,
        error: `Quest generation limit reached. You have ${genRateLimit.remaining} generations remaining this week.`,
      },
      429,
    )
  }

  // Active quest count check
  const activeCount = await getActiveQuestCount(kv, userId)
  if (activeCount >= 3) {
    return jsonResponse(
      {
        success: false,
        error: 'You can have up to 3 active quests. Complete or abandon one first.',
      },
      400,
    )
  }

  try {
    // Strip HTML from user goal
    const sanitizedGoal = stripHtml(parsed.data.userGoal)

    // Load life graph for context
    const vectorizeEnv = getVectorizeEnv()
    let memoryContext = ''
    try {
      const results = await searchLifeGraph(
        kv, vectorizeEnv, userId, sanitizedGoal,
        { topK: 3, category: 'goal' },
      )
      if (results.length > 0) {
        memoryContext = results
          .slice(0, 3)
          .map(r => r.node.title)
          .join(', ')
          .slice(0, 200)
      }
    } catch {
      // Non-critical — continue without context
    }

    // Build generation input
    const input: QuestGenerationInput = {
      userGoal: sanitizedGoal,
      category: parsed.data.category as QuestCategory,
      difficulty: parsed.data.difficulty as QuestDifficulty,
      targetDurationDays: parsed.data.targetDurationDays,
      existingMemoryContext: memoryContext || undefined,
    }

    // Generate quest
    const quest = await generateQuest(input)

    // Set userId from Clerk (override whatever the generator produced)
    quest.userId = userId

    // Save quest
    await addQuest(kv, userId, quest)

    // Increment rate limit
    await incrementQuestGenRateLimit(kv, userId)

    // Create corresponding LifeNode
    try {
      const lifeNode = await addOrUpdateNode(
        kv, vectorizeEnv, userId,
        {
          userId,
          category: 'goal',
          title: quest.title,
          detail: quest.description,
          tags: [quest.category, 'quest'],
          people: [],
          emotionalWeight: 0.7,
          confidence: 0.8,
          source: 'explicit',
        },
      )

      // Store LifeNode ID in quest
      if (lifeNode?.id) {
        quest.goalNodeId = lifeNode.id
        // Re-save with goalNodeId
        const { updateQuest: updateQuestFn } = await import('@/lib/quests/quest-store')
        await updateQuestFn(kv, userId, quest.id, { goalNodeId: lifeNode.id })
      }
    } catch {
      // Non-critical — quest still works without LifeNode link
    }

    logRequest('quests.create', userId, startTime, { questId: quest.id })
    return jsonResponse(
      { success: true, quest },
      201,
      rateLimitHeaders(rateResult),
    )
  } catch (err) {
    logError('quests.create.error', err, userId)
    return jsonResponse(
      { success: false, error: 'Failed to generate quest' },
      500,
    )
  }
}
