import { NextRequest, NextResponse } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { z } from 'zod'
import { getRequestContext } from "@cloudflare/next-on-pages"
import { getHistory, addToHistory } from "@/lib/sleep-sessions/session-store"
import { validationErrorResponse } from "@/lib/validation/schemas"
import type { KVStore } from "@/types"

export const runtime = "edge"

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return NextResponse.json({ success: false, error: "DB unavailable" }, { status: 500 })

  const entries = await getHistory(kv, userId, 20)
  return NextResponse.json({ success: true, data: { entries } })
}

const historySchema = z.object({
  sessionId: z.string().min(1).max(40),
  mode: z.enum(['personalized_story', 'custom_story', 'breathing', 'library']),
  title: z.string().max(80),
  completed: z.boolean(),
  durationSec: z.number().int().min(0).max(7200)
})

export async function POST(req: NextRequest) {
  let userId: string
  try {
    userId = await getVerifiedUserId()
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    throw e
  }

  const kv = getKV()
  if (!kv) return NextResponse.json({ success: false, error: "DB unavailable" }, { status: 500 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = historySchema.safeParse(body)
  if (!parsed.success) {
    return validationErrorResponse(parsed.error)
  }

  const entry = {
    id: parsed.data.sessionId,
    date: new Date().toISOString(),
    mode: parsed.data.mode,
    title: parsed.data.title,
    completed: parsed.data.completed,
    durationSec: parsed.data.durationSec
  }

  await addToHistory(kv, userId, entry)

  return NextResponse.json({ success: true })
}
