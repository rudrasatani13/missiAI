// ─── Autonomous Action Engine Types ───────────────────────────────────────────

export type ActionType =
  | 'web_search'
  | 'draft_email'
  | 'draft_message'
  | 'set_reminder'
  | 'take_note'
  | 'calculate'
  | 'translate'
  | 'summarize'
  | 'none'

export interface ActionIntent {
  type: ActionType
  confidence: number
  parameters: Record<string, string>
  rawUserMessage: string
}

export interface ActionResult {
  success: boolean
  type: ActionType
  output: string
  data?: Record<string, unknown>
  actionTaken: string
  canUndo: boolean
  executedAt: number
}

export interface ActionHistory {
  actions: ActionResult[]
  lastActionAt: number
}
