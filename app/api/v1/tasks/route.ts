/**
 * GET /api/v1/tasks — List user's background tasks
 *
 * Returns all tasks for the authenticated user with their current status.
 * Used by the client-side polling hook to check for completed tasks.
 */

import { getCloudflareContext } from "@opennextjs/cloudflare"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { getUserTasks, getActiveTasks } from "@/lib/tasks/task-store"
import type { KVStore } from "@/types"


function getKV(): KVStore | null {
  try {
    const { env } = getCloudflareContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function GET() {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response("Unauthorized", { status: 401 })
  }

  const kv = getKV()
  if (!kv) {
    return Response.json({ tasks: [], hasActive: false })
  }

  const tasks = await getUserTasks(kv, userId)
  const active = tasks.filter(t => t.status === "pending" || t.status === "running")

  return Response.json({
    tasks: tasks.slice(-10), // Return last 10 tasks
    hasActive: active.length > 0,
  })
}
