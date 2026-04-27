import type { KVStore } from '@/types'
import { getCloudflareKVBinding } from '@/lib/server/platform/bindings'
import { AuthenticationError, getVerifiedUserId, unauthorizedResponse } from '@/lib/server/security/auth'

export function profileCardJsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export type ProfileCardAuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response }

export async function getAuthenticatedProfileCardUserId(): Promise<ProfileCardAuthResult> {
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

export type ProfileCardKvResult =
  | { ok: true; kv: KVStore }
  | { ok: false; response: Response }

export function requireProfileCardKV(): ProfileCardKvResult {
  const kv = getCloudflareKVBinding()
  if (!kv) {
    return {
      ok: false,
      response: profileCardJsonResponse({ success: false, error: 'Failed to load profile data' }, 500),
    }
  }

  return { ok: true, kv }
}

export function shouldRefreshProfileCard(req: { nextUrl: URL }): boolean {
  return req.nextUrl.searchParams.get('refresh') === 'true'
}

export function getProfileCardCacheKey(userId: string): string {
  return `profile:card:${userId}`
}
