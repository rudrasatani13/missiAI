import { z } from 'zod'
import type { KVStore } from '@/types'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'
import { validationErrorResponse } from '@/lib/validation/schemas'

const taskIdSchema = z.string().min(1, 'Task ID required').max(20, 'Task ID too long')

export function dailyBriefJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export type DailyBriefAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedDailyBriefUserId(): Promise<DailyBriefAuthResult> {
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

export type DailyBriefKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireDailyBriefKV(): DailyBriefKvResult {
  const kv = getCloudflareKVBinding()
  if (!kv) {
    return {
      ok: false,
      response: dailyBriefJsonResponse(
        { success: false, error: 'Service unavailable', code: 'INTERNAL_ERROR' },
        500,
      ),
    }
  }

  return { ok: true, kv }
}

export function parseDailyBriefGenerationQuery(req: Pick<Request, 'url'>): {
  forceRefresh: boolean
  clientTimezone?: string
  localHour?: number
} {
  const url = new URL(req.url)
  const clientTimezone = url.searchParams.get('tz') || undefined
  const clientHour = parseInt(url.searchParams.get('hour') ?? '', 10)
  const localHour = Number.isNaN(clientHour) ? undefined : Math.max(0, Math.min(23, clientHour))

  return {
    forceRefresh: url.searchParams.get('refresh') === 'true',
    clientTimezone,
    localHour,
  }
}

export type DailyBriefTaskIdResult =
  | { ok: true; taskId: string }
  | { ok: false; response: Response }

export function parseDailyBriefTaskId(taskId: string): DailyBriefTaskIdResult {
  const parsed = taskIdSchema.safeParse(taskId)
  if (!parsed.success) {
    return { ok: false, response: validationErrorResponse(parsed.error) }
  }

  return { ok: true, taskId: parsed.data }
}
