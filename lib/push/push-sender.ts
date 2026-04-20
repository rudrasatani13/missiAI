/**
 * Push Notification Sender
 *
 * High-level helper that reads the user's push subscription from KV
 * and sends a notification using the edge-compatible VAPID implementation.
 *
 * This helper also enforces the user-facing preferences authored on
 * Settings → Notifications (quiet hours + per-category toggles), so every
 * caller automatically respects them without having to duplicate the logic.
 */

import type { KVStore } from "@/types"
import { sendPushNotification, type PushSubscription } from "./edge-web-push"
import {
  getNotificationPrefs,
  shouldSendNotification,
  type NotificationEventType,
} from "@/lib/notifications/prefs"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string
  body: string
  icon?: string
  data?: Record<string, unknown>
  /**
   * Category this push belongs to. Used to gate against the user's per-type
   * toggle in Settings → Notifications. Defaults to `"generic"` (quiet hours
   * only, no category gate).
   */
  eventType?: NotificationEventType
}

// ─── Sender ───────────────────────────────────────────────────────────────────

/**
 * Send a push notification to a user.
 *
 * Returns `true` if actually sent. Returns `false` when:
 *   • The user has no push subscription.
 *   • VAPID keys are not configured.
 *   • The user has muted this category (e.g. `notifyMood = false`) or is
 *     currently inside their quiet-hours window.
 *   • The push request failed at the provider.
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

  // Respect the user's Notifications preferences BEFORE any network work.
  try {
    const prefs = await getNotificationPrefs(kv, userId)
    const allowed = shouldSendNotification(prefs, payload.eventType ?? "generic")
    if (!allowed) return false
  } catch {
    // If prefs can't be read, fail-open: send the notification. This matches
    // pre-prefs behaviour so we don't regress existing pushes when KV is flaky.
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
