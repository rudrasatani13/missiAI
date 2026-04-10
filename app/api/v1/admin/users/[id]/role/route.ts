import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { log, logApiError } from "@/lib/server/logger"

export const runtime = "edge"

// Rate limiting is handled by the middleware's IP-based limiter (100 req/min).
// Adding KV-backed rate limiting here would pull in @cloudflare/next-on-pages
// and push the Cloudflare Pages bundle over the 25 MiB limit.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startTime = Date.now()
  const { id: targetUserId } = await params

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) {
      return new NextResponse(
        JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      )
    }
    return new NextResponse(
      JSON.stringify({ success: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 2. Admin check (defense-in-depth — middleware also checks) ─────────────
  const clerkAuth = await auth()
  const role = (clerkAuth.sessionClaims?.metadata as any)?.role
  const isRoleAdmin = role === "admin"
  const isSuperAdminEnv = process.env.ADMIN_USER_ID ? userId === process.env.ADMIN_USER_ID : false

  if (!isRoleAdmin && !isSuperAdminEnv) {
    log({
      level: "warn",
      event: "admin.role_change.forbidden",
      userId,
      metadata: { targetUserId },
      timestamp: Date.now(),
    })
    return new NextResponse(
      JSON.stringify({ success: false, error: "Forbidden", code: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 3. Validate body ───────────────────────────────────────────────────────
  let body: { role?: string }
  try {
    body = await req.json()
  } catch {
    return new NextResponse(
      JSON.stringify({ success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  if (!body.role) {
    return new NextResponse(
      JSON.stringify({ success: false, error: "Role is required", code: "VALIDATION_ERROR" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  try {
    const client = await clerkClient()

    // 1. Update the user's role in Clerk public metadata
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: {
        role: body.role,
      },
    })

    // 2. Proactively secure the application by forcing logout.
    // We must invalidate all active sessions for the user so their next login 
    // strictly mints fresh tokens reflecting the newly assigned access privileges.
    const sessions = await client.sessions.getSessionList({ userId: targetUserId })
    
    for (const session of sessions.data) {
      // Ignore inactive sessions to save API calls
      if (session.status === 'active') {
        await client.sessions.revokeSession(session.id)
      }
    }

    log({
      level: "info",
      event: "admin.role_change.success",
      userId,
      durationMs: Date.now() - startTime,
      metadata: { targetUserId, newRole: body.role },
      timestamp: Date.now(),
    })

    return new NextResponse(
      JSON.stringify({ 
        success: true, 
        message: "User role updated and active sessions revoked for security." 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )

  } catch (error) {
    logApiError("admin.role_change.error", error, { userId, httpStatus: 500 })
    return new NextResponse(
      JSON.stringify({ success: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}

