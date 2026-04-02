import type { PluginResult } from "@/types/plugins"

// ─── Webhook Plugin ───────────────────────────────────────────────────────────
// All calls use fetch() — no SDK, fully edge-compatible.

const TIMEOUT_MS = 10_000

/**
 * Trigger an HTTPS webhook with a JSON payload.
 * Rejects http:// URLs for security.
 */
export async function triggerWebhook(
  url: string,
  secret: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<PluginResult> {
  if (!url.startsWith("https://")) {
    return {
      success: false,
      pluginId: "webhook",
      action: "trigger_webhook",
      output: "Only HTTPS webhooks allowed",
      executedAt: Date.now(),
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (secret) {
    headers["X-Webhook-Secret"] = secret
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: method || "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (res.ok) {
      return {
        success: true,
        pluginId: "webhook",
        action: "trigger_webhook",
        output: "Webhook triggered successfully",
        executedAt: Date.now(),
      }
    }

    return {
      success: false,
      pluginId: "webhook",
      action: "trigger_webhook",
      output: `Webhook returned error ${res.status}`,
      executedAt: Date.now(),
    }
  } catch (err) {
    const isAbort =
      err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"))

    return {
      success: false,
      pluginId: "webhook",
      action: "trigger_webhook",
      output: isAbort ? "Webhook timed out after 10 seconds" : "Webhook request failed",
      executedAt: Date.now(),
    }
  } finally {
    clearTimeout(timer)
  }
}
