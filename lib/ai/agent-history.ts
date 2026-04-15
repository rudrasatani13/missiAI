import type { KVStore } from "@/types"

export interface AgentHistoryEntry {
  id: string           // nanoid(8) equivalent
  date: string         // ISO timestamp
  userMessage: string  // original request (max 100 chars)
  planSummary: string  // what was planned
  stepsCompleted: number
  stepsTotal: number
  status: 'completed' | 'partial' | 'cancelled'
}

export async function getAgentHistory(
  kv: KVStore,
  userId: string
): Promise<AgentHistoryEntry[]> {
  const key = `agent-history:${userId}`
  try {
    const raw = await kv.get(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed as AgentHistoryEntry[]
  } catch {}
  return []
}

export async function addAgentHistory(
  kv: KVStore,
  userId: string,
  entry: AgentHistoryEntry
): Promise<void> {
  const key = `agent-history:${userId}`
  try {
    let history = await getAgentHistory(kv, userId)
    history.unshift(entry)

    // Keep last 50
    if (history.length > 50) {
      history = history.slice(0, 50)
    }

    await kv.put(key, JSON.stringify(history))
  } catch (error) {
    console.error("[Agent History] Failed to add history", error)
  }
}
