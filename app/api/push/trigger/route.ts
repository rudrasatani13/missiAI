import { NextRequest } from "next/server"
import { getVerifiedUserId, AuthenticationError, unauthorizedResponse } from "@/lib/server/auth"
import { getRequestContext } from "@cloudflare/next-on-pages"
import type { KVStore } from "@/types"
import webpush from "web-push"
import { getEnv } from "@/lib/server/env"

export const runtime = "nodejs" // Force nodejs to support crypto module for webpush

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getVerifiedUserId()
    const kv = getKV()
    if (!kv) return new Response("KV missing", { status: 500 })

    const rawSub = await kv.get(`push:${userId}`)
    if (!rawSub) return new Response("No subscription found", { status: 404 })

    const subscription = JSON.parse(rawSub)
    const payload = await req.json()

    // Retrieve from env or raw variable 
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ""
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY || ""

    webpush.setVapidDetails(
      "mailto:hello@missi.space",
      vapidPublic,
      vapidPrivate
    )

    await webpush.sendNotification(subscription, JSON.stringify({
      title: payload.title || "MissiAI",
      body: payload.body || "Proactive check-in message!"
    }))

    return new Response(JSON.stringify({ success: true }))
  } catch (e) {
    if (e instanceof AuthenticationError) return unauthorizedResponse()
    return new Response(String((e as Error).message), { status: 500 })
  }
}
