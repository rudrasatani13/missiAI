import type { VisualMemoryRecord } from '@/types/visual-memory'
import { getUserPlan } from '@/lib/billing/tier-checker'
import {
  checkRateLimit,
  rateLimitExceededResponse,
  type UserTier,
} from '@/lib/server/security/rate-limiter'
import { awardXP } from '@/lib/gamification/xp-engine'
import { addOrUpdateNode } from '@/lib/memory/life-graph'
import { waitUntil } from '@/lib/server/platform/wait-until'
import {
  analyzeImageWithGemini,
  mapExtractionToLifeNode,
} from '@/lib/visual-memory/image-analyzer'
import {
  addVisualRecord,
  deleteVisualRecord,
  getVisualRateLimit,
  getVisualRecords,
  incrementVisualRateLimit,
} from '@/lib/visual-memory/visual-store'
import {
  getVisualMemoryVectorizeEnv,
  parseVisualMemoryAnalyzeRequest,
  parseVisualMemoryDeleteBody,
  parseVisualMemoryGalleryLimit,
  requireVisualMemoryKV,
  visualMemoryJsonResponse,
} from '@/lib/server/routes/visual-memory/helpers'

const PLAN_LIMITS: Record<string, number> = { free: 10, plus: 50, pro: 50 }

export async function runVisualMemoryGalleryGetRoute(
  req: Pick<Request, 'url'>,
  userId: string,
): Promise<Response> {
  const kvResult = requireVisualMemoryKV()
  if (!kvResult.ok) {
    return kvResult.response
  }

  const planId = await getUserPlan(userId)
  const rateTier: UserTier = planId === 'free' ? 'free' : 'paid'
  const rateResult = await checkRateLimit(userId, rateTier, 'gallery')
  if (!rateResult.allowed) {
    return rateLimitExceededResponse(rateResult)
  }

  const limit = parseVisualMemoryGalleryLimit(req)
  const records = await getVisualRecords(kvResult.kv, userId, limit)
  const dailyLimit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free
  const usedToday = await getVisualRateLimit(kvResult.kv, userId)
  const remainingToday = Math.max(0, dailyLimit - usedToday)

  return visualMemoryJsonResponse({ success: true, records, total: records.length, remainingToday })
}

export async function runVisualMemoryGalleryDeleteRoute(
  req: Pick<Request, 'json'>,
  userId: string,
): Promise<Response> {
  const kvResult = requireVisualMemoryKV()
  if (!kvResult.ok) {
    return kvResult.response
  }

  const deleteBodyResult = await parseVisualMemoryDeleteBody(req)
  if (!deleteBodyResult.ok) {
    return deleteBodyResult.response
  }

  await deleteVisualRecord(kvResult.kv, userId, deleteBodyResult.nodeId)
  return visualMemoryJsonResponse({ success: true })
}

export async function runVisualMemoryAnalyzeRoute(
  req: Pick<Request, 'formData'>,
  userId: string,
): Promise<Response> {
  const kvResult = requireVisualMemoryKV()
  if (!kvResult.ok) {
    return kvResult.response
  }

  const analyzeRequestResult = await parseVisualMemoryAnalyzeRequest(req)
  if (!analyzeRequestResult.ok) {
    return analyzeRequestResult.response
  }

  const planId = await getUserPlan(userId)
  const dailyLimit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free
  const usedToday = await getVisualRateLimit(kvResult.kv, userId)

  if (usedToday >= dailyLimit) {
    return visualMemoryJsonResponse(
      {
        success: false,
        error: `Daily limit reached (${dailyLimit} images/day on the ${planId} plan). Upgrade to Pro for more.`,
        code: 'RATE_LIMIT_EXCEEDED',
        dailyLimit,
        usedToday,
      },
      429,
    )
  }

  const extraction = await analyzeImageWithGemini(
    analyzeRequestResult.imageBytes,
    analyzeRequestResult.mimeType,
    analyzeRequestResult.sanitizedNote,
  )
  const nodeInput = mapExtractionToLifeNode(extraction, userId)
  const vectorizeEnv = getVisualMemoryVectorizeEnv()
  const savedNode = await addOrUpdateNode(kvResult.kv, vectorizeEnv, userId, nodeInput)

  const record: VisualMemoryRecord = {
    nodeId: savedNode.id,
    processedDate: new Date().toISOString().slice(0, 10),
    category: extraction.category,
    summary: extraction.title,
    userNote: analyzeRequestResult.sanitizedNote,
    tags: extraction.tags,
    createdAt: Date.now(),
  }
  await addVisualRecord(kvResult.kv, userId, record)

  waitUntil(incrementVisualRateLimit(kvResult.kv, userId).catch(() => {}))
  waitUntil(awardXP(kvResult.kv, userId, 'memory', 1).catch(() => {}))

  const remainingToday = Math.max(0, dailyLimit - usedToday - 1)
  return visualMemoryJsonResponse({
    success: true,
    nodeId: savedNode.id,
    category: extraction.category,
    title: extraction.title,
    detail: extraction.detail,
    recallHint: extraction.recallHint,
    tags: extraction.tags,
    structuredData: extraction.structuredData,
    remainingToday,
  })
}
