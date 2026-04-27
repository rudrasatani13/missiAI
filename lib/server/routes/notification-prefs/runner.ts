import { logError, logRequest } from "@/lib/server/observability/logger"
import {
  DEFAULT_NOTIFICATION_PREFS,
  getNotificationPrefs,
  setNotificationPrefs,
} from "@/lib/notifications/prefs"
import {
  getAuthenticatedNotificationPrefsUserId,
  getNotificationPrefsKV,
  notificationPrefsJsonResponse,
  parseNotificationPrefsBody,
  runNotificationPrefsRateLimitPreflight,
} from "@/lib/server/routes/notification-prefs/helpers"

export async function runNotificationPrefsGetRoute(): Promise<Response> {
  const startTime = Date.now()
  const auth = await getAuthenticatedNotificationPrefsUserId()
  if (!auth.ok) return auth.response

  const kv = getNotificationPrefsKV()
  if (!kv) {
    return notificationPrefsJsonResponse({ success: true, data: DEFAULT_NOTIFICATION_PREFS })
  }

  try {
    const prefs = await getNotificationPrefs(kv, auth.userId)
    logRequest("notif_prefs.read", auth.userId, startTime)
    return notificationPrefsJsonResponse({ success: true, data: prefs })
  } catch (error) {
    logError("notif_prefs.read_error", error, auth.userId)
    return notificationPrefsJsonResponse({ success: true, data: DEFAULT_NOTIFICATION_PREFS })
  }
}

export async function runNotificationPrefsPostRoute(req: Request): Promise<Response> {
  const startTime = Date.now()
  const auth = await getAuthenticatedNotificationPrefsUserId()
  if (!auth.ok) return auth.response

  const ratePreflight = await runNotificationPrefsRateLimitPreflight(auth.userId)
  if (!ratePreflight.ok) return ratePreflight.response

  const requestBody = await parseNotificationPrefsBody(req)
  if (!requestBody.ok) return requestBody.response

  const kv = getNotificationPrefsKV()
  if (!kv) {
    return notificationPrefsJsonResponse(
      { success: false, error: "Storage unavailable", code: "SERVICE_UNAVAILABLE" },
      503,
    )
  }

  try {
    await setNotificationPrefs(kv, auth.userId, requestBody.data)
    logRequest("notif_prefs.write", auth.userId, startTime)
    return notificationPrefsJsonResponse({ success: true, data: requestBody.data })
  } catch (error) {
    logError("notif_prefs.write_error", error, auth.userId)
    return notificationPrefsJsonResponse(
      { success: false, error: "Failed to save", code: "INTERNAL_ERROR" },
      500,
    )
  }
}
