/**
 * Agent Execution History
 *
 * Records agent execution results in KV for the history view.
 * Keeps the last 50 entries per user; returns the most recent 20 to the client.
 */

import type { KVStore } from "@/types"

const MAX_STORED_ENTRIES = 50
const MAX_RETURNED_ENTRIES = 20

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentHistoryEntry {
  id: string
  date: string           // ISO timestamp
  userMessage: string    // original request, max 100 chars
  planSummary: string
  stepsCompleted: number
  stepsTotal: number
  status: "completed" | "partial" | "cancelled"
}

// ─── KV helpers ───────────────────────────────────────────────────────────────

/**
 * Append a new entry to the user's agent history.
 * Keeps only the last MAX_STORED_ENTRIES entries.
 */
export async function saveAgentHistory(
  kv: KVStore,
  userId: string,
  entry: AgentHistoryEntry,
): Promise<void> {
  const key = `agent-history:${userId}`
  let entries: AgentHistoryEntry[] = []
  try {
    const raw = await kv.get(key)
    if (raw) entries = JSON.parse(raw) as AgentHistoryEntry[]
  } catch {}

  entries.push(entry)
  if (entries.length > MAX_STORED_ENTRIES) {
    entries = entries.slice(-MAX_STORED_ENTRIES)
  }

  await kv.put(key, JSON.stringify(entries))
}

/**
 * Retrieve the user's recent agent history (most recent MAX_RETURNED_ENTRIES).
 */
export async function getAgentHistory(
  kv: KVStore,
  userId: string,
): Promise<AgentHistoryEntry[]> {
  try {
    const raw = await kv.get(`agent-history:${userId}`)
    if (!raw) return []
    const entries = JSON.parse(raw) as AgentHistoryEntry[]
    return entries.slice(-MAX_RETURNED_ENTRIES).reverse()
  } catch {
    return []
  }
}
