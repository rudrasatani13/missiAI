export type MoodScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export type MoodLabel =
  | 'joyful'
  | 'excited'
  | 'calm'
  | 'content'
  | 'neutral'
  | 'tired'
  | 'anxious'
  | 'stressed'
  | 'sad'
  | 'overwhelmed'

export interface MoodEntry {
  /** YYYY-MM-DD date string */
  date: string
  /** Numeric score 1-10 where 10 = most positive */
  score: MoodScore
  /** Human-readable emotion label */
  label: MoodLabel
  /** What topic or context drove this mood (max 60 chars) */
  trigger: string
  /** Unix ms timestamp of when this was recorded */
  recordedAt: number
  /** The conversation session this came from (optional, for deduplication) */
  sessionId?: string
}

export interface MoodTimeline {
  userId: string
  entries: MoodEntry[]
  /** Unix ms of the last update */
  lastUpdatedAt: number
  /** Running version counter */
  version: number
}

export interface WeeklyMoodInsight {
  weekLabel: string         // e.g. "April 7–13, 2025"
  averageScore: number      // 1-10, one decimal
  dominantLabel: MoodLabel
  bestDay: string           // YYYY-MM-DD
  bestDayLabel: MoodLabel
  insight: string           // Gemini-generated, 1-2 sentences max
  generatedAt: number       // unix ms
}
