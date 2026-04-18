import type { PluginResult } from "@/types/plugins"
import { promises as dns } from "node:dns"

// ─── Webhook Plugin ───────────────────────────────────────────────────────────
// All calls use fetch() — no SDK, fully edge-compatible.

const TIMEOUT_MS = 10_000

/**
 * Checks if a given IP address is internal/private.
 */
function isInternalIp(ip: string): boolean {
  // IPv4 Checks
  const ipv4Match = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (ipv4Match) {
    const parts = ipv4Match.slice(1).map(Number)
    if (
      parts[0] === 0 || // 0.0.0.0/8 (Current network)
      parts[0] === 127 || // 127.0.0.0/8 (Loopback)
      parts[0] === 10 || // 10.0.0.0/8 (Private)
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12 (Private)
      (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16 (Private)
      (parts[0] === 169 && parts[1] === 254) || // 169.254.0.0/16 (Link-local)
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || // 100.64.0.0/10 (CGNAT)
      (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) || // 198.18.0.0/15 (Benchmarking)
      parts[0] >= 224 // 224.0.0.0/4 (Multicast) and 240.0.0.0/4 (Reserved)
    ) {
      return true
    }
  }

  // IPv6 Checks
  if (ip.includes(":")) {
    const cleanIp = ip.replace(/^\[|\]$/g, "").toLowerCase()

    // Loopback
    if (cleanIp === "::1" || cleanIp === "0:0:0:0:0:0:0:1") return true
    // Unspecified
    if (cleanIp === "::" || cleanIp === "0:0:0:0:0:0:0:0") return true

    // Unique Local Addresses (fc00::/7)
    if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true

    // Link-local (fe80::/10)
    if (cleanIp.startsWith("fe8") || cleanIp.startsWith("fe9") || cleanIp.startsWith("fea") || cleanIp.startsWith("feb")) return true

    // IPv4-mapped IPv6 (::ffff:0:0/96)
    if (cleanIp.startsWith("::ffff:")) return true

    // Discard prefix (64:ff9b::/96)
    if (cleanIp.startsWith("64:ff9b::")) return true

    // Teredo tunneling
    if (cleanIp.startsWith("2001:0:") || cleanIp.startsWith("2001:::")) return true

    // Benchmarking
    if (cleanIp.startsWith("2001:2::")) return true

    // Documentation
    if (cleanIp.startsWith("2001:db8:")) return true
  }

  return false
}

/**
 * Checks if a URL resolves to a safe, external IP.
 * Helps prevent SSRF (Server-Side Request Forgery) attacks.
 */
async function isSafeWebhookUrl(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString)

    if (url.protocol !== "https:") {
      return false
    }

    const hostname = url.hostname.toLowerCase()

    // Static Checks
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal")
    ) {
      return false
    }

    // Direct IP Check
    if (/^[\d\.]+$/.test(hostname) || hostname.includes(":")) {
      if (isInternalIp(hostname)) return false
    }

    // DNS Resolution Check
    try {
      const lookupResult = await dns.lookup(hostname)
      if (lookupResult && lookupResult.address) {
        if (isInternalIp(lookupResult.address)) {
          return false
        }
      }
    } catch (dnsError) {
      // If DNS resolution fails, reject it
      return false
    }

    return true
  } catch {
    // If URL parsing fails, deny
    return false
  }
}

/**
 * Trigger an HTTPS webhook with a JSON payload.
 * Rejects http:// URLs and internal/private IPs for security (SSRF prevention).
 */
export async function triggerWebhook(
  url: string,
  secret: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<PluginResult> {
  const isSafe = await isSafeWebhookUrl(url)
  if (!isSafe) {
    return {
      success: false,
      pluginId: "webhook",
      action: "trigger_webhook",
      output: "Invalid webhook URL: Only public HTTPS webhooks allowed",
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
