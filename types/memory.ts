// ─── Structured Memory Types ──────────────────────────────────────────────────

export interface MemoryFact {
  /** Unique identifier (nanoid, 8 chars) */
  id: string
  /** The factual statement (max 200 chars) */
  text: string
  /** Topic keywords for relevance matching (max 5) */
  tags: string[]
  /** Unix timestamp (ms) when fact was created */
  createdAt: number
  /** How many times this fact has been retrieved for a prompt */
  accessCount: number
}

export interface UserMemoryStore {
  /** All stored memory facts for this user */
  facts: MemoryFact[]
  /** Unix timestamp (ms) of last extraction run */
  lastExtractedAt: number
  /** Rolling count of POST interactions (used to trigger extraction every 5th) */
  interactionCount: number
}
