// ─── Visual Memory Types ──────────────────────────────────────────────────────

export type VisualMemoryCategory =
  | 'food'        // Restaurant menus, recipes, food photos
  | 'product'     // Products, prices, specs, shopping
  | 'contact'     // Business cards, contact info, people
  | 'event'       // Posters, invitations, schedules, dates
  | 'document'    // Notes, whiteboards, text documents, forms
  | 'place'       // Maps, locations, addresses, directions
  | 'receipt'     // Bills, expenses, transaction records
  | 'inspiration' // Quotes, ideas, mood boards, references
  | 'general'     // Anything that doesn't fit the above

export interface VisualExtraction {
  /** The dominant category of what was in the image */
  category: VisualMemoryCategory
  /** Short descriptive title for this memory (max 80 chars) */
  title: string
  /** Rich extracted context (max 500 chars) — the most important information from the image */
  detail: string
  /** Specific structured data extracted — e.g. price, date, phone number, address (max 200 chars) */
  structuredData: string | null
  /** Relevant tags for search retrieval (max 8) */
  tags: string[]
  /** Names of people visible or mentioned (if any) */
  people: string[]
  /** Emotional weight of this memory (0-1) — 0 for a receipt, 0.8 for a personal photo */
  emotionalWeight: number
  /** What the user should ask Missi to retrieve this later (1 example natural language query) */
  recallHint: string
}

export interface VisualMemoryRecord {
  /** Nanoid, 12 chars — matches the LifeNode.id this extraction created or updated */
  nodeId: string
  /** YYYY-MM-DD when the image was processed */
  processedDate: string
  /** The visual category */
  category: VisualMemoryCategory
  /** Brief description of what was remembered */
  summary: string
  /** Optional user-provided context note */
  userNote: string | null
  /** Tags extracted from the image */
  tags: string[]
  /** Unix ms */
  createdAt: number
}
