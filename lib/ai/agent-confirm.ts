/**
 * Agent Confirmation System
 *
 * Generates and verifies single-use HMAC-SHA256 confirmation tokens for
 * destructive agent actions. Tokens are stored in KV with a 5-minute TTL
 * and consumed (deleted) on first read.
 *
 * Security properties:
 * - Tokens are HMAC-signed — cannot be forged without the secret
 * - Single-use — deleted from KV immediately on verify
 * - 5-minute TTL — expired tokens return null
 * - userId-scoped — tokens issued for one user cannot be used by another
 * - Never logged or included in error messages
 */

import type { KVStore } from "@/types"
import type { AgentPlan } from "./agent-planner"

const TOKEN_TTL_SECONDS = 300 // 5 minutes

function requireConfirmSecret(secret: string | undefined): string {
  if (!secret || secret.trim().length === 0) {
    throw new Error("MISSI_KV_ENCRYPTION_SECRET is required")
  }
  return secret
}

// ─── Token Generation ────────────────────────────────────────────────────────

/**
 * Generate a signed confirmation token using HMAC-SHA256.
 * Uses the Web Crypto API (available in Cloudflare Workers / Edge Runtime).
 */
export async function generateConfirmToken(
  planHash: string,
  userId: string,
  encryptionSecret: string,
): Promise<string> {
  const secret = requireConfirmSecret(encryptionSecret)
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )

  const data = `${planHash}:${userId}:${Date.now()}`
  const signature = await crypto.subtle.sign(
    "HMAC",
    keyMaterial,
    new TextEncoder().encode(data),
  )

  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

// ─── Token Storage ──────────────────────────────────────────────────────────

interface StoredConfirmToken {
  plan: AgentPlan
  userId: string
  createdAt: number
}

/**
 * Store a confirmation token in KV with a 5-minute TTL.
 * KV key: agent-confirm:{token}
 */
export async function storeConfirmToken(
  kv: KVStore,
  token: string,
  plan: AgentPlan,
  userId: string,
): Promise<void> {
  const payload: StoredConfirmToken = {
    plan,
    userId,
    createdAt: Date.now(),
  }
  await kv.put(
    `agent-confirm:${token}`,
    JSON.stringify(payload),
    { expirationTtl: TOKEN_TTL_SECONDS },
  )
}

// ─── Token Verification ─────────────────────────────────────────────────────

/**
 * Verify a confirmation token and consume it (single-use).
 * Returns the associated AgentPlan on success, null on failure.
 *
 * Failure cases:
 * - Token not found (expired or never issued)
 * - userId mismatch (replay from different user)
 * - JSON parse failure
 */
export async function verifyAndConsumeToken(
  kv: KVStore,
  token: string,
  userId: string,
): Promise<AgentPlan | null> {
  const raw = await kv.get(`agent-confirm:${token}`)
  if (!raw) return null

  // Delete immediately — single-use
  await kv.delete(`agent-confirm:${token}`)

  try {
    const stored = JSON.parse(raw) as StoredConfirmToken
    if (stored.userId !== userId) return null
    return stored.plan
  } catch {
    return null
  }
}
