import type { KVStore } from "@/types"
import type { AgentPlan } from "./agent-planner"

export async function generateConfirmToken(
  planHash: string,
  userId: string,
  encryptionSecret: string
): Promise<string> {
  const encoder = new TextEncoder()
  const keyMaterial = encoder.encode(encryptionSecret)
  const data = encoder.encode(`${planHash}:${userId}:${Date.now()}`)

  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign("HMAC", key, data)

  // Convert ArrayBuffer to hex string
  const hashArray = Array.from(new Uint8Array(signature))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}

export async function storeConfirmToken(
  kv: KVStore,
  token: string,
  plan: AgentPlan,
  userId: string
): Promise<void> {
  const key = `agent-confirm:${token}`
  const value = JSON.stringify({ plan, userId, createdAt: Date.now() })

  // 5 minutes TTL
  await kv.put(key, value, { expirationTtl: 300 })
}

export async function verifyAndConsumeToken(
  kv: KVStore,
  token: string,
  userId: string
): Promise<AgentPlan | null> {
  const key = `agent-confirm:${token}`

  try {
    const raw = await kv.get(key)
    if (!raw) return null

    // Always delete the token immediately (single-use)
    await kv.delete(key)

    const parsed = JSON.parse(raw)

    if (parsed.userId !== userId) return null

    return parsed.plan as AgentPlan
  } catch (error) {
    return null
  }
}
