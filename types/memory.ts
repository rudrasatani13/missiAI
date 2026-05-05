// ─── Life Graph Memory Types ──────────────────────────────────────────────────

export type MemoryCategory =
  | 'person'
  | 'goal'
  | 'habit'
  | 'preference'
  | 'event'
  | 'emotion'
  | 'skill'
  | 'place'
  | 'belief'
  | 'relationship'

export interface LifeNode {
  /** Unique identifier (nanoid, 12 chars) */
  id: string
  /** Owner user ID from Clerk */
  userId: string
  /** What kind of life fact this represents */
  category: MemoryCategory
  /** Short label (max 80 chars) */
  title: string
  /** Rich context with nuance (max 2500 chars) */
  detail: string
  /** Topic tags for retrieval (max 8) */
  tags: string[]
  /** Names of people involved */
  people: string[]
  /** How emotionally significant (0-1) */
  emotionalWeight: number
  /** How certain AI is of this fact (0-1) */
  confidence: number
  /** Unix timestamp (ms) when node was created */
  createdAt: number
  /** Unix timestamp (ms) when node was last updated */
  updatedAt: number
  /** How many times this node has been retrieved for a prompt */
  accessCount: number
  /** Unix timestamp (ms) of last retrieval */
  lastAccessedAt: number
  /** How the fact was learned */
  source: 'conversation' | 'explicit' | 'inferred' | 'visual'
}

export interface LifeGraph {
  /** All stored life nodes for this user */
  nodes: LifeNode[]
  /** Rolling count of interactions */
  totalInteractions: number
  /** Unix timestamp (ms) of last graph update */
  lastUpdatedAt: number
  /** Schema version — incremented on every save */
  version: number
}

export interface MemorySearchResult {
  /** The matched life node */
  node: LifeNode
  /** Relevance score (0-1) */
  score: number
  /** Human-readable reason for the match */
  reason: string
}
