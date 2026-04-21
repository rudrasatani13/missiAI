import { NextRequest, NextResponse } from "next/server"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { logRequest, logError, logApiError } from "@/lib/server/logger"
import { z } from "zod"
import { getClientSafePersona } from "@/lib/personas/persona-config"
import {
  getUserPersona,
  saveUserPersona,
  getPersonaRateLimit,
  incrementPersonaRateLimit,
  isPersonaRateLimited,
} from "@/lib/personas/persona-store"
import type { KVStore } from "@/types"


// ─── Zod Schema — strict allowlist validation ─────────────────────────────────

const personaSaveSchema = z.object({
  personaId: z.enum(["default", "calm", "coach", "friend", "bollywood", "desi-mom"]),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as Record<string, unknown>).MISSI_MEMORY as KVStore ?? null
  } catch {
    return null
  }
}

// ─── GET /api/v1/persona ──────────────────────────────────────────────────────
// Returns the user's current persona preference (UI-safe fields only).

export async function GET() {
  const startTime = Date.now()

  // 1. Auth — userId from Clerk only
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("persona.get.auth_error", e)
    throw e
  }

  // 2. KV
  const kv = getKV()
  if (!kv) {
    logError("persona.get.kv_unavailable", "KV not available")
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
      { status: 500 },
    )
  }

  // 3. Load persona
  try {
    const personaId = await getUserPersona(kv, userId)
    const safe = getClientSafePersona(personaId)
    logRequest("persona.get.completed", userId, startTime)
    return NextResponse.json({ success: true, ...safe })
  } catch (e) {
    logApiError("persona.get.error", e, { userId, httpStatus: 500 })
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}

// ─── POST /api/v1/persona ─────────────────────────────────────────────────────
// Saves the user's persona preference.

export async function POST(req: NextRequest) {
  const startTime = Date.now()

  // 1. Auth — userId from Clerk only
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    logError("persona.post.auth_error", e)
    throw e
  }

  // 2. KV
  const kv = getKV()
  if (!kv) {
    logError("persona.post.kv_unavailable", "KV not available")
    return NextResponse.json(
      { success: false, error: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE" },
      { status: 500 },
    )
  }

  // 3. Parse & validate body with Zod
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" },
      { status: 400 },
    )
  }

  const parsed = personaSaveSchema.safeParse(body)
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]
    const message = firstIssue
      ? `Validation error: ${firstIssue.path.join(".")} — ${firstIssue.message}`
      : "Invalid persona ID"
    logRequest("persona.post.validation_error", userId, startTime)
    return NextResponse.json(
      { success: false, error: message, code: "VALIDATION_ERROR" },
      { status: 400 },
    )
  }

  const { personaId } = parsed.data

  // 4. Rate limit check
  try {
    const count = await getPersonaRateLimit(kv, userId)
    if (isPersonaRateLimited(count)) {
      logRequest("persona.post.rate_limited", userId, startTime)
      return NextResponse.json(
        { success: false, error: "Too many persona changes this hour. Try again later.", code: "RATE_LIMITED" },
        { status: 429 },
      )
    }
  } catch (e) {
    logError("persona.post.rate_limit_error", e, userId)
    // If rate limit check fails, allow the save to proceed (fail-open for UX)
  }

  // 5. Save persona
  try {
    await saveUserPersona(kv, userId, personaId)
    // Increment rate limit — fire-and-forget
    incrementPersonaRateLimit(kv, userId).catch(() => {})

    const safe = getClientSafePersona(personaId)
    logRequest("persona.post.completed", userId, startTime, { personaId })

    return NextResponse.json({
      success: true,
      personaId: safe.personaId,
      displayName: safe.displayName,
    })
  } catch (e) {
    logApiError("persona.post.error", e, { userId, httpStatus: 500 })
    return NextResponse.json(
      { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 },
    )
  }
}
