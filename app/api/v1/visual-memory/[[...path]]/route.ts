// ─── Visual Memory — Consolidated Catch-All Route ─────────────────────────────
//
// Handles:
//   path=[] (base)   → GET (gallery), DELETE (remove record)
//   path=["analyze"] → POST (analyze image)

import { type NextRequest } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { z } from 'zod'
import {
  getVerifiedUserId,
  AuthenticationError,
  unauthorizedResponse,
} from '@/lib/server/auth'
import { getUserPlan } from '@/lib/billing/tier-checker'
import { logError } from '@/lib/server/logger'
import { addOrUpdateNode } from '@/lib/memory/life-graph'
import type { VectorizeEnv } from '@/lib/memory/vectorize'
import {
  analyzeImageWithGemini,
  mapExtractionToLifeNode,
} from '@/lib/visual-memory/image-analyzer'
import {
  getVisualRecords,
  deleteVisualRecord,
  addVisualRecord,
  getVisualRateLimit,
  incrementVisualRateLimit,
} from '@/lib/visual-memory/visual-store'
import { awardXP } from '@/lib/gamification/xp-engine'
import { waitUntil } from '@/lib/server/wait-until'
import type { VisualMemoryRecord } from '@/types/visual-memory'
import type { KVStore } from '@/types'


const PLAN_LIMITS: Record<string, number> = { free: 10, plus: 50, pro: 50 }
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_FILE_SIZE_BYTES = 5_242_880

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch { return null }
}

function getVectorizeEnv(): VectorizeEnv | null {
  try {
    const { env } = getCloudflareContext()
    const lifeGraph = (env as Record<string, unknown>).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph as VectorizeEnv['LIFE_GRAPH'] }
  } catch { return null }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function validateMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 4) return false
  const b0 = bytes[0], b1 = bytes[1], b2 = bytes[2], b3 = bytes[3]
  switch (mimeType) {
    case 'image/jpeg': return b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF
    case 'image/png': return b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47
    case 'image/webp':
      if (b0 !== 0x52 || b1 !== 0x49 || b2 !== 0x46 || b3 !== 0x46) return false
      if (bytes.length < 12) return false
      return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    case 'image/heic': case 'image/heif':
      if (bytes.length < 12) return false
      return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
    default: return false
  }
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '').trim()
}

const limitSchema = z.coerce.number().int().min(1).max(100).default(20)
const deleteBodySchema = z.object({ nodeId: z.string().min(1).max(20) })
const noteSchema = z.string().max(200).optional()

// ─── Gallery GET ──────────────────────────────────────────────────────────────

async function handleGalleryGet(req: NextRequest) {
  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('visual-memory.get.auth_error', e); throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' }, 500)

  const url = new URL(req.url)
  const limitRaw = url.searchParams.get('limit') ?? '20'
  const limitResult = limitSchema.safeParse(limitRaw)
  const limit = limitResult.success ? limitResult.data : 20

  const records = await getVisualRecords(kv, userId, limit)
  const planId = await getUserPlan(userId)
  const dailyLimit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free
  const usedToday = await getVisualRateLimit(kv, userId)
  const remainingToday = Math.max(0, dailyLimit - usedToday)

  return jsonResponse({ success: true, records, total: records.length, remainingToday })
}

// ─── Gallery DELETE ───────────────────────────────────────────────────────────

async function handleGalleryDelete(req: NextRequest) {
  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('visual-memory.delete.auth_error', e); throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' }, 500)

  let body: unknown
  try { body = await req.json() } catch {
    return jsonResponse({ success: false, error: 'Invalid JSON body', code: 'VALIDATION_ERROR' }, 400)
  }

  const parsed = deleteBodySchema.safeParse(body)
  if (!parsed.success) return jsonResponse({ success: false, error: 'Invalid nodeId', code: 'VALIDATION_ERROR' }, 400)

  await deleteVisualRecord(kv, userId, parsed.data.nodeId)
  return jsonResponse({ success: true })
}

// ─── Analyze POST ─────────────────────────────────────────────────────────────

async function handleAnalyze(req: NextRequest) {
  let userId: string
  try { userId = await getVerifiedUserId() } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('visual-memory.analyze.auth_error', e); throw e
  }

  const kv = getKV()
  if (!kv) return jsonResponse({ success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' }, 500)

  let formData: FormData
  try { formData = await req.formData() } catch {
    return jsonResponse({ success: false, error: 'Invalid form data', code: 'VALIDATION_ERROR' }, 400)
  }

  const fileField = formData.get('file')
  if (!fileField || !(fileField instanceof File)) {
    return jsonResponse({ success: false, error: 'Missing file field', code: 'VALIDATION_ERROR' }, 400)
  }

  const mimeType = fileField.type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return jsonResponse({ success: false, error: 'Unsupported file type. Please use JPEG, PNG, WebP, HEIC, or HEIF.', code: 'UNSUPPORTED_MEDIA_TYPE' }, 415)
  }

  const arrayBuffer = await fileField.arrayBuffer()
  const imageBytes = new Uint8Array(arrayBuffer)

  if (imageBytes.length > MAX_FILE_SIZE_BYTES) {
    return jsonResponse({ success: false, error: 'Image too large — maximum size is 5MB.', code: 'PAYLOAD_TOO_LARGE' }, 413)
  }

  if (!validateMagicBytes(imageBytes, mimeType)) {
    return jsonResponse({ success: false, error: 'File content does not match declared type.', code: 'INVALID_FILE' }, 400)
  }

  const rawNote = formData.get('note')
  const noteParseResult = noteSchema.safeParse(rawNote !== null ? String(rawNote) : undefined)
  if (!noteParseResult.success) {
    return jsonResponse({ success: false, error: 'Note must be 200 characters or fewer.', code: 'VALIDATION_ERROR' }, 400)
  }
  const sanitizedNote = noteParseResult.data ? stripHtml(noteParseResult.data) : null

  const planId = await getUserPlan(userId)
  const dailyLimit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free
  const usedToday = await getVisualRateLimit(kv, userId)

  if (usedToday >= dailyLimit) {
    return jsonResponse({
      success: false,
      error: `Daily limit reached (${dailyLimit} images/day on the ${planId} plan). Upgrade to Pro for more.`,
      code: 'RATE_LIMIT_EXCEEDED', dailyLimit, usedToday,
    }, 429)
  }

  const extraction = await analyzeImageWithGemini(imageBytes, mimeType, sanitizedNote)
  const nodeInput = mapExtractionToLifeNode(extraction, userId)
  const vectorizeEnv = getVectorizeEnv()
  const savedNode = await addOrUpdateNode(kv, vectorizeEnv, userId, nodeInput)

  const today = new Date().toISOString().slice(0, 10)
  const record: VisualMemoryRecord = {
    nodeId: savedNode.id, processedDate: today, category: extraction.category,
    summary: extraction.title, userNote: sanitizedNote, tags: extraction.tags, createdAt: Date.now(),
  }
  await addVisualRecord(kv, userId, record)

  // The rate-limit increment MUST survive worker termination —
  // a user could race the response-close to bypass the daily cap
  // if the .catch() promise was dropped when the isolate ended.
  waitUntil(incrementVisualRateLimit(kv, userId).catch(() => {}))
  waitUntil(awardXP(kv, userId, 'memory', 1).catch(() => {}))

  const remainingToday = Math.max(0, dailyLimit - usedToday - 1)
  return jsonResponse({
    success: true, nodeId: savedNode.id, category: extraction.category,
    title: extraction.title, detail: extraction.detail, recallHint: extraction.recallHint,
    tags: extraction.tags, structuredData: extraction.structuredData, remainingToday,
  })
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  // Base path: /api/v1/visual-memory → gallery list
  if (!segment) return handleGalleryGet(req)

  return jsonResponse({ error: 'Not found' }, 404)
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (!segment) return handleGalleryDelete(req)
  return jsonResponse({ error: 'Not found' }, 404)
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await params
  const segment = path?.[0]

  if (segment === 'analyze') return handleAnalyze(req)
  return jsonResponse({ error: 'Not found' }, 404)
}
