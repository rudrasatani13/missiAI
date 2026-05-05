/**
 * Notification Preferences — KV-backed user-facing settings.
 *
 * Authoring surface: Settings → Notifications (`app/settings/page.tsx`).
 * Consumers:
 *   • `lib/push/push-sender.ts#notifyUser` — skips sends based on
 *     quiet-hours + per-event toggle.
 *   • Any future cron dispatcher that emits opt-in check-in pushes.
 *
 * Storage: KV key  `notif-prefs:{userId}`
 * Shape:   `StoredNotificationPrefs` (JSON-stringified).
 */

import type { KVStore } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Logical categories the settings UI exposes. The dispatcher passes one of
 * these on every `notifyUser` call; prefs gate whether the push actually
 * fires.
 */
export type NotificationEventType = "checkin" | "generic"

export interface StoredNotificationPrefs {
  quietHoursEnabled: boolean
  /** "HH:MM" 24-hour */
  quietHoursStart: string
  /** "HH:MM" 24-hour */
  quietHoursEnd: string
  notifyCheckIn: boolean
  /** IANA timezone name, e.g. "Asia/Kolkata" — used for quiet-hours math. */
  timezone: string
}

export const DEFAULT_NOTIFICATION_PREFS: StoredNotificationPrefs = {
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  notifyCheckIn: true,
  timezone: "UTC",
}

// ─── KV I/O ──────────────────────────────────────────────────────────────────

const kvKey = (userId: string) => `notif-prefs:${userId}`

export async function getNotificationPrefs(
  kv: KVStore,
  userId: string,
): Promise<StoredNotificationPrefs> {
  try {
    const raw = await kv.get(kvKey(userId))
    if (!raw) return DEFAULT_NOTIFICATION_PREFS
    const parsed = JSON.parse(raw) as Partial<StoredNotificationPrefs>
    return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed }
  } catch {
    return DEFAULT_NOTIFICATION_PREFS
  }
}

export async function setNotificationPrefs(
  kv: KVStore,
  userId: string,
  prefs: StoredNotificationPrefs,
): Promise<void> {
  await kv.put(kvKey(userId), JSON.stringify(prefs))
}

// ─── Pure evaluators (safe to call from edge runtimes) ────────────────────────

/**
 * Return true when `nowUtcMs` falls inside the user's quiet hours window.
 * Handles wrap-around windows like 22:00 → 08:00 (spans midnight).
 */
export function isInQuietHours(
  prefs: StoredNotificationPrefs,
  nowUtcMs: number = Date.now(),
): boolean {
  if (!prefs.quietHoursEnabled) return false

  // Use Intl.DateTimeFormat to resolve the current HH:MM in the user's TZ.
  let hour: number
  let minute: number
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: prefs.timezone || "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    const parts = fmt.formatToParts(new Date(nowUtcMs))
    hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0")
    minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0")
  } catch {
    // Unknown timezone — fall back to UTC.
    const d = new Date(nowUtcMs)
    hour = d.getUTCHours()
    minute = d.getUTCMinutes()
  }

  const nowMin = hour * 60 + minute
  const startMin = hmToMinutes(prefs.quietHoursStart)
  const endMin = hmToMinutes(prefs.quietHoursEnd)

  if (startMin === endMin) return false // misconfigured window — treat as off

  if (startMin < endMin) {
    // Simple window within the same day (e.g. 09:00 → 17:00).
    return nowMin >= startMin && nowMin < endMin
  }
  // Wrap-around window (e.g. 22:00 → 08:00).
  return nowMin >= startMin || nowMin < endMin
}

function hmToMinutes(hm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!m) return 0
  const h = Math.max(0, Math.min(23, Number(m[1])))
  const mi = Math.max(0, Math.min(59, Number(m[2])))
  return h * 60 + mi
}

/**
 * Decide whether a push of the given type should actually be delivered.
 * Returns `true` to allow, `false` to suppress.
 */
export function shouldSendNotification(
  prefs: StoredNotificationPrefs,
  eventType: NotificationEventType,
  nowUtcMs: number = Date.now(),
): boolean {
  if (isInQuietHours(prefs, nowUtcMs)) return false
  switch (eventType) {
    case "checkin":
      return prefs.notifyCheckIn
    case "generic":
      // Generic pushes (e.g. system alerts) bypass per-category toggles but
      // still honour quiet hours.
      return true
    default:
      return true
  }
}
