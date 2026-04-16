/**
 * Push Notification Sender
 *
 * High-level helper that reads the user's push subscription from KV
 * and sends a notification using the edge-compatible VAPID implementation.
 */

import type { KVStore } from "@/types"
import { sendPushNotification, type PushSubscription } from "./edge-web-push"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string
  body: string
  icon?: string
  data?: Record<string, unknown>
}

// ─── Sender ───────────────────────────────────────────────────────────────────

/**
 * Send a push notification to a user.
 * Returns true if sent, false if no subscription or push failed.
 */
export async function notifyUser(
  kv: KVStore,
  userId: string,
  payload: PushPayload,
): Promise<boolean> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[push] VAPID keys not configured — skipping push notification")
    return false
  }

  // Read subscription from KV
  let subscription: PushSubscription | null = null
  try {
    const raw = await kv.get(`push:${userId}`)
    if (!raw) return false
    subscription = JSON.parse(raw) as PushSubscription
  } catch {
    return false
  }

  const result = await sendPushNotification(
    subscription,
    {
      title: payload.title,
      body: payload.body,
      icon: payload.icon || "/images/logo-symbol.png",
      data: payload.data,
    },
    vapidPublicKey,
    vapidPrivateKey,
  )

  // Remove expired subscriptions
  if (result.statusCode === 410) {
    await kv.delete(`push:${userId}`).catch(() => {})
  }

  return result.success
}
