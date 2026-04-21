// ─── Proactive Intelligence Types ─────────────────────────────────────────────

export type BriefingItemType =
  | 'goal_nudge'
  | 'relationship_reminder'
  | 'habit_check'
  | 'calendar_prep'
  | 'memory_insight'
  | 'weather_heads_up'
  | 'task_followup'
  | 'daily_win'
  | 'tomorrow_prep'
  | 'gratitude_prompt'
  | 'sleep_nudge'

export interface BriefingItem {
  /** What kind of proactive nudge this is */
  type: BriefingItemType
  /** Urgency level */
  priority: 'high' | 'medium' | 'low'
  /** Voice-friendly message, max 120 chars */
  message: string
  /** Linked LifeNode id, if relevant */
  nodeId?: string
  /** Does this require user action? */
  actionable: boolean
  /** Unix ms timestamp when user dismissed this item */
  dismissedAt?: number
}

export interface DailyBriefing {
  /** Owner user ID from Clerk */
  userId: string
  /** Calendar date this briefing covers (YYYY-MM-DD) */
  date: string
  /** The briefing items, ordered by priority */
  items: BriefingItem[]
  /** Unix ms timestamp when this briefing was generated */
  generatedAt: number
  /** Unix ms timestamp when this briefing was first shown to the user */
  deliveredAt?: number
  /** Emotional tone for TTS delivery */
  tone: 'energetic' | 'calm' | 'focused'
}

export interface ProactiveConfig {
  /** Master switch — when false, no briefings or nudges */
  enabled: boolean
  /** When to deliver the daily briefing (HH:MM, 24-hour, user's local time) */
  briefingTime: string
  /** IANA timezone string, e.g. "America/New_York" */
  timezone: string
  /** Whether real-time nudges are active between briefings */
  nudgesEnabled: boolean
  /** Cap on items per daily briefing (default 5) */
  maxItemsPerBriefing: number
  /** Whether evening wind-down reflection is enabled */
  windDownEnabled: boolean
  /** When to deliver the wind-down reflection (HH:MM, 24-hour format) */
  windDownTime: string
}

export interface EveningReflection {
  /** Owner user ID from Clerk */
  userId: string
  /** Calendar date this reflection covers (YYYY-MM-DD) */
  date: string
  /** The reflection items, 3-5 calming items */
  items: BriefingItem[]
  /** Unix ms timestamp when this reflection was generated */
  generatedAt: number
  /** Unix ms timestamp when this reflection was first shown to the user */
  deliveredAt?: number
  /** Emotional tone — evening is always calm or reflective */
  tone: 'calm' | 'reflective'
}
