// ─── Visual Memory — Analyze Image Endpoint ───────────────────────────────────
//
// POST /api/v1/visual-memory/analyze
//
// Accepts multipart/form-data with:
//   - file: image file (JPEG, PNG, WebP, HEIC, HEIF — max 5MB)
//   - note: optional user context note (max 200 chars)
//
// SECURITY RULES:
// Rule 1 — userId always from Clerk only.
// Rule 2 — Strict server-side file validation (MIME, size, magic bytes).
// Rule 3 — Image processed in memory only — NEVER written to persistent store.
// Rule 4 — Image sent to Gemini as inline base64 — never as URL.
// Rule 5 — Rate limiting per user per day (KV-backed).
// Rule 6 — Note field sanitized with Zod + HTML stripping.
// Rule 7 — All Gemini output sanitized before storage.
// Rule 8 — Response NEVER contains image bytes or base64 data.

import { type NextRequest } from 'next/server'
import { getRequestContext } from '@cloudflare/next-on-pages'
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
  addVisualRecord,
  getVisualRateLimit,
  incrementVisualRateLimit,
} from '@/lib/visual-memory/visual-store'
import type { VisualMemoryRecord } from '@/types/visual-memory'
import type { KVStore } from '@/types'
import { awardXP } from '@/lib/gamification/xp-engine'

export const runtime = 'edge'

// ─── Rate Limits by Plan ──────────────────────────────────────────────────────

// Security Rule 5: Per-user per-day caps
const PLAN_LIMITS: Record<string, number> = {
  free: 10,
  plus: 50,
  pro:  50,
}

// ─── MIME Type Allowlist ──────────────────────────────────────────────────────

// Security Rule 2: Strict MIME allowlist — reject all others with 415
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const MAX_FILE_SIZE_BYTES = 5_242_880 // 5 MB

// ─── Magic Bytes Validation ───────────────────────────────────────────────────
//
// Security Rule 2: Validate that file bytes match the declared MIME type.
// Never trust client-declared content type alone.

function validateMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 4) return false

  const b0 = bytes[0], b1 = bytes[1], b2 = bytes[2], b3 = bytes[3]

  switch (mimeType) {
    case 'image/jpeg':
      // JPEG: FF D8 FF
      return b0 === 0xFF && b1 === 0xD8 && b2 === 0xFF
    case 'image/png':
      // PNG: 89 50 4E 47
      return b0 === 0x89 && b1 === 0x50 && b2 === 0x4E && b3 === 0x47
    case 'image/webp':
      // WebP: 52 49 46 46 (RIFF header) — then bytes 8-11 are "WEBP"
      if (b0 !== 0x52 || b1 !== 0x49 || b2 !== 0x46 || b3 !== 0x46) return false
      if (bytes.length < 12) return false
      return (
        bytes[8] === 0x57 && bytes[9] === 0x45 &&
        bytes[10] === 0x42 && bytes[11] === 0x50
      )
    case 'image/heic':
    case 'image/heif':
      // HEIC/HEIF: ftyp box — bytes 4-7 are the brand
      // Common brands: heic, heix, hevc, mif1, msf1
      if (bytes.length < 12) return false
      // bytes 4-7 must be 'ftyp' (66 74 79 70)
      return bytes[4] === 0x66 && bytes[5] === 0x74 &&
             bytes[6] === 0x79 && bytes[7] === 0x70
    default:
      return false
  }
}

// ─── HTML Stripping ───────────────────────────────────────────────────────────
//
// Security Rule 6: Strip HTML from user note before use.

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '').trim()
}

// ─── KV / Vectorize Helpers ───────────────────────────────────────────────────

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
    const lifeGraph = (env as Record<string, unknown>).LIFE_GRAPH
    if (!lifeGraph) return null
    return { LIFE_GRAPH: lifeGraph as VectorizeEnv['LIFE_GRAPH'] }
  } catch {
    return null
  }
}

// ─── Note Validation Schema ───────────────────────────────────────────────────

const noteSchema = z.string().max(200).optional()

// ─── Response Helper ──────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ─── POST Handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // ── Security Rule 1: UserId always from Clerk only ──────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError('visual-memory.analyze.auth_error', e)
    throw e
  }

  // ── Load KV ─────────────────────────────────────────────────────────────────
  const kv = getKV()
  if (!kv) {
    return jsonResponse(
      { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
      500,
    )
  }

  // ── Security Rule 2: Parse multipart/form-data ───────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return jsonResponse(
      { success: false, error: 'Invalid form data', code: 'VALIDATION_ERROR' },
      400,
    )
  }

  // ── Extract file field ────────────────────────────────────────────────────────
  const fileField = formData.get('file')
  if (!fileField || !(fileField instanceof File)) {
    return jsonResponse(
      { success: false, error: 'Missing file field', code: 'VALIDATION_ERROR' },
      400,
    )
  }

  // ── Security Rule 2: Validate MIME type against allowlist ────────────────────
  // Never trust client-declared content type alone — magic bytes check follows
  const mimeType = fileField.type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return jsonResponse(
      {
        success: false,
        error: 'Unsupported file type. Please use JPEG, PNG, WebP, HEIC, or HEIF.',
        code: 'UNSUPPORTED_MEDIA_TYPE',
      },
      415,
    )
  }

  // ── Security Rule 2: Read file bytes and validate size ───────────────────────
  const arrayBuffer = await fileField.arrayBuffer()
  const imageBytes = new Uint8Array(arrayBuffer)

  if (imageBytes.length > MAX_FILE_SIZE_BYTES) {
    return jsonResponse(
      {
        success: false,
        error: 'Image too large — maximum size is 5MB.',
        code: 'PAYLOAD_TOO_LARGE',
      },
      413,
    )
  }

  // ── Security Rule 2: Magic bytes check ──────────────────────────────────────
  // Validates that the file content matches the declared MIME type.
  // Rejects disguised files (e.g. HTML/JS with image/* content-type).
  if (!validateMagicBytes(imageBytes, mimeType)) {
    return jsonResponse(
      {
        success: false,
        error: 'File content does not match declared type.',
        code: 'INVALID_FILE',
      },
      400,
    )
  }

  // ── Security Rule 6: Validate and sanitize note field ───────────────────────
  const rawNote = formData.get('note')
  const noteParseResult = noteSchema.safeParse(
    rawNote !== null ? String(rawNote) : undefined,
  )
  if (!noteParseResult.success) {
    return jsonResponse(
      { success: false, error: 'Note must be 200 characters or fewer.', code: 'VALIDATION_ERROR' },
      400,
    )
  }
  // Strip HTML from user note before injecting into prompt or storing
  const sanitizedNote = noteParseResult.data ? stripHtml(noteParseResult.data) : null

  // ── Security Rule 5: Rate limit check ───────────────────────────────────────
  const planId = await getUserPlan(userId)
  const dailyLimit = PLAN_LIMITS[planId] ?? PLAN_LIMITS.free
  const usedToday = await getVisualRateLimit(kv, userId)

  if (usedToday >= dailyLimit) {
    return jsonResponse(
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

  // ── Security Rule 3 & 4: Analyze image — bytes stay in memory only ──────────
  // imageBytes are passed to Gemini as inline base64.
  // They are NEVER written to KV, R2, or any persistent store.
  const extraction = await analyzeImageWithGemini(
    imageBytes,
    mimeType,
    sanitizedNote,
  )

  // imageBytes are no longer referenced after this point — GC eligible
  // Security Rule 3: no persistent store write of image data

  // ── Store extracted memory in LifeGraph ─────────────────────────────────────
  const nodeInput = mapExtractionToLifeNode(extraction, userId)
  const vectorizeEnv = getVectorizeEnv()

  const savedNode = await addOrUpdateNode(
    kv,
    vectorizeEnv,
    userId,
    nodeInput,
  )

  // ── Add record to visual memory gallery index ────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const record: VisualMemoryRecord = {
    nodeId: savedNode.id,
    processedDate: today,
    category: extraction.category,
    summary: extraction.title,
    userNote: sanitizedNote,
    tags: extraction.tags,
    createdAt: Date.now(),
  }

  await addVisualRecord(kv, userId, record)

  // ── Fire-and-forget: rate limit increment + XP ───────────────────────────────
  // These are non-blocking — failures do not affect the response
  incrementVisualRateLimit(kv, userId).catch(() => {})
  awardXP(kv, userId, 'memory', 1).catch(() => {})

  const remainingToday = Math.max(0, dailyLimit - usedToday - 1)

  // ── Security Rule 8: Response NEVER contains image bytes or base64 ───────────
  return jsonResponse({
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
