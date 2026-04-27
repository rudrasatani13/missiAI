import { z } from 'zod'
import type { KVStore } from '@/types'
import type { VectorizeEnv } from '@/lib/memory/vectorize'
import { getCloudflareKVBinding, getCloudflareVectorizeEnv } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_FILE_SIZE_BYTES = 5_242_880
const limitSchema = z.coerce.number().int().min(1).max(100).default(20)
const deleteBodySchema = z.object({ nodeId: z.string().min(1).max(20) })
const noteSchema = z.string().max(200).optional()

export function visualMemoryJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type VisualMemoryAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedVisualMemoryUserId(): Promise<VisualMemoryAuthResult> {
  try {
    const userId = await getVerifiedUserId()
    return { ok: true, userId }
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return { ok: false, response: unauthorizedResponse() }
    }

    throw error
  }
}

export type VisualMemoryKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireVisualMemoryKV(): VisualMemoryKvResult {
  const kv = getCloudflareKVBinding()
  if (!kv) {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
        500,
      ),
    }
  }

  return { ok: true, kv }
}

export function getVisualMemoryVectorizeEnv(): VectorizeEnv | null {
  return getCloudflareVectorizeEnv()
}

export function parseVisualMemoryGalleryLimit(req: Pick<Request, 'url'>): number {
  const url = new URL(req.url)
  const limitRaw = url.searchParams.get('limit') ?? '20'
  const limitResult = limitSchema.safeParse(limitRaw)
  return limitResult.success ? limitResult.data : 20
}

export type VisualMemoryDeleteBodyResult =
  | { ok: true; nodeId: string }
  | { ok: false; response: Response }

export async function parseVisualMemoryDeleteBody(
  req: Pick<Request, 'json'>,
): Promise<VisualMemoryDeleteBodyResult> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'Invalid JSON body', code: 'VALIDATION_ERROR' },
        400,
      ),
    }
  }

  const parsed = deleteBodySchema.safeParse(body)
  if (!parsed.success) {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'Invalid nodeId', code: 'VALIDATION_ERROR' },
        400,
      ),
    }
  }

  return { ok: true, nodeId: parsed.data.nodeId }
}

function validateMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 4) return false
  const b0 = bytes[0]
  const b1 = bytes[1]
  const b2 = bytes[2]
  const b3 = bytes[3]

  switch (mimeType) {
    case 'image/jpeg':
      return b0 === 0xff && b1 === 0xd8 && b2 === 0xff
    case 'image/png':
      return b0 === 0x89 && b1 === 0x50 && b2 === 0x4e && b3 === 0x47
    case 'image/webp':
      if (b0 !== 0x52 || b1 !== 0x49 || b2 !== 0x46 || b3 !== 0x46) return false
      if (bytes.length < 12) return false
      return bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    case 'image/heic':
    case 'image/heif':
      if (bytes.length < 12) return false
      return bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70
    default:
      return false
  }
}

function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, '').trim()
}

export type VisualMemoryAnalyzeRequestResult =
  | { ok: true; imageBytes: Uint8Array; mimeType: string; sanitizedNote: string | null }
  | { ok: false; response: Response }

export async function parseVisualMemoryAnalyzeRequest(
  req: Pick<Request, 'formData'>,
): Promise<VisualMemoryAnalyzeRequestResult> {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'Invalid form data', code: 'VALIDATION_ERROR' },
        400,
      ),
    }
  }

  const fileField = formData.get('file')
  if (!fileField || !(fileField instanceof File)) {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'Missing file field', code: 'VALIDATION_ERROR' },
        400,
      ),
    }
  }

  const mimeType = fileField.type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        {
          success: false,
          error: 'Unsupported file type. Please use JPEG, PNG, WebP, HEIC, or HEIF.',
          code: 'UNSUPPORTED_MEDIA_TYPE',
        },
        415,
      ),
    }
  }

  const arrayBuffer = await fileField.arrayBuffer()
  const imageBytes = new Uint8Array(arrayBuffer)

  if (imageBytes.length > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'Image too large — maximum size is 5MB.', code: 'PAYLOAD_TOO_LARGE' },
        413,
      ),
    }
  }

  if (!validateMagicBytes(imageBytes, mimeType)) {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'File content does not match declared type.', code: 'INVALID_FILE' },
        400,
      ),
    }
  }

  const rawNote = formData.get('note')
  const noteParseResult = noteSchema.safeParse(rawNote !== null ? String(rawNote) : undefined)
  if (!noteParseResult.success) {
    return {
      ok: false,
      response: visualMemoryJsonResponse(
        { success: false, error: 'Note must be 200 characters or fewer.', code: 'VALIDATION_ERROR' },
        400,
      ),
    }
  }

  const sanitizedNote = noteParseResult.data ? stripHtml(noteParseResult.data) : null
  return { ok: true, imageBytes, mimeType, sanitizedNote }
}
