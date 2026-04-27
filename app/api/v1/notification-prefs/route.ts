/**
 * GET /api/v1/notification-prefs   — hydrate Settings page from server.
 * POST /api/v1/notification-prefs  — persist Settings page toggles.
 *
 * Storage: KV `notif-prefs:{userId}` via `lib/notifications/prefs.ts`.
 * Consumers: `lib/push/push-sender.ts#notifyUser` reads the same keys so
 * changes here take effect on every subsequent push.
 */

import { NextRequest } from "next/server"
import {
  runNotificationPrefsGetRoute,
  runNotificationPrefsPostRoute,
} from "@/lib/server/routes/notification-prefs/runner"

export async function GET() {
  return runNotificationPrefsGetRoute()
}

export async function POST(req: NextRequest) {
  return runNotificationPrefsPostRoute(req)
}
