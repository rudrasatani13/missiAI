import { NextRequest, NextResponse } from "next/server"
import { auth, clerkClient } from "@clerk/nextjs/server"
import { getVerifiedUserId, AuthenticationError } from "@/lib/server/auth"
import { z } from "zod"


// Rate limiting is handled by the middleware's IP-based limiter (100 req/min).
// Structured logging via @/lib/server/logger is avoided here because it pulls in
// heavy deps that push the Cloudflare Pages bundle over the 25 MiB limit.

// SECURITY (H1): Whitelist of allowed role values — prevents arbitrary metadata injection.
const roleSchema = z.object({
  role: z.enum(['user', 'admin'], { message: 'Role must be "user" or "admin"' }),
})

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
    // Structured log: admin access denied
    console.warn(JSON.stringify({ event: "admin.role_change.forbidden", userId, targetUserId, timestamp: Date.now() }))
    return new NextResponse(
      JSON.stringify({ success: false, error: "Forbidden", code: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )
  }

  // ── 3. Validate body ───────────────────────────────────────────────────────
  let rawBody: unknown
  try {
    rawBody = await req.json()
  } catch {
    return new NextResponse(
      JSON.stringify({ success: false, error: "Invalid JSON body", code: "VALIDATION_ERROR" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const parsed = roleSchema.safeParse(rawBody)
  if (!parsed.success) {
    return new NextResponse(
      JSON.stringify({ success: false, error: parsed.error.issues[0]?.message ?? "Invalid role", code: "VALIDATION_ERROR" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    )
  }

  const { role: newRole } = parsed.data

  // SECURITY: Prevent admin from demoting themselves — requires a different admin
  if (targetUserId === userId && newRole !== 'admin') {
    return new NextResponse(
      JSON.stringify({ success: false, error: "Cannot demote your own admin account", code: "FORBIDDEN" }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    )
  }

  try {
    const client = await clerkClient()

    // 1. Update the user's role in Clerk public metadata
    await client.users.updateUserMetadata(targetUserId, {
      publicMetadata: {
        role: newRole,
      },
    })

    // 2. Proactively secure the application by forcing logout.
    // We must invalidate all active sessions for the user so their next login 
    // strictly mints fresh tokens reflecting the newly assigned access privileges.
    const sessions = await client.sessions.getSessionList({ userId: targetUserId })
    
    const revokePromises = sessions.data
      .filter(session => session.status === 'active')
      .map(session => client.sessions.revokeSession(session.id))

    await Promise.all(revokePromises)

    console.info(JSON.stringify({
      event: "admin.role_change.success",
      userId,
      targetUserId,
      newRole,
      durationMs: Date.now() - startTime,
      timestamp: Date.now(),
    }))

    return new NextResponse(
      JSON.stringify({ 
        success: true, 
        message: "User role updated and active sessions revoked for security." 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )

  } catch (error) {
    console.error(JSON.stringify({ event: "admin.role_change.error", userId, error: error instanceof Error ? error.message : String(error), timestamp: Date.now() }))
    return new NextResponse(
      JSON.stringify({ success: false, error: "Internal server error", code: "INTERNAL_ERROR" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
