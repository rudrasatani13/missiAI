// ─── Health Check Endpoint ────────────────────────────────────────────────────
//
// GET /api/health — no auth required.
// Returns system status with KV and env checks.
// No versioning on health endpoint.

import { getRequestContext } from "@cloudflare/next-on-pages"
import { envExists } from "@/lib/server/env"
import { log } from "@/lib/server/logger"
import type { KVStore } from "@/types"

export const runtime = "edge"

interface HealthResponse {
  status: "ok" | "degraded" | "down"
  version: string
  checks: {
    kv: "ok" | "error"
    env: "ok" | "missing"
  }
  timestamp: number
}

function getKV(): KVStore | null {
  try {
    const { env } = getRequestContext()
    return (env as any).MISSI_MEMORY ?? null
  } catch {
    return null
  }
}

async function checkKV(kv: KVStore | null): Promise<"ok" | "error"> {
  if (!kv) return "error"

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 2000)

    // Attempt a small read — key doesn't need to exist
    await Promise.race([
      kv.get("health:ping"),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error("KV timeout")),
        )
      }),
    ])

    clearTimeout(timeout)
    return "ok"
  } catch {
    return "error"
  }
}

function checkEnvVars(): "ok" | "missing" {
  // SECURITY (M2): Check required env vars without revealing their names
  // in the response. Prevents deployment fingerprinting by attackers.
  const requiredCount = 3
  let present = 0
  for (const key of ["GOOGLE_SERVICE_ACCOUNT_JSON", "ELEVENLABS_API_KEY", "CLERK_SECRET_KEY"]) {
    if (envExists(key)) present++
  }
  return present >= requiredCount ? "ok" : "missing"
}

export async function GET() {
  const kv = getKV()
  const kvStatus = await checkKV(kv)
  const envStatus = checkEnvVars()

  let status: HealthResponse["status"]
  if (kvStatus === "ok" && envStatus === "ok") {
    status = "ok"
  } else if (kvStatus === "error" && envStatus === "missing") {
    status = "down"
  } else {
    status = "degraded"
  }

  // Build response without exposing sensitive data or stack traces
  const response: HealthResponse = {
    status,
    version: process.env.npm_package_version ?? "unknown",
    checks: {
      kv: kvStatus,
      env: envStatus,
    },
    timestamp: Date.now(),
  }

  log({
    level: status === "ok" ? "info" : "warn",
    event: "health.check",
    metadata: { status, kv: kvStatus, env: envStatus },
    timestamp: Date.now(),
  })

  const httpStatus = status === "ok" ? 200 : status === "degraded" ? 207 : 503

  return new Response(JSON.stringify(response), {
    status: httpStatus,
    headers: { "Content-Type": "application/json" },
  })
}
