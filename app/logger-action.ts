"use server"

import { logError } from "@/lib/server/logger"

export async function logClientError(event: string, error: unknown) {
  logError(event, error)
}
