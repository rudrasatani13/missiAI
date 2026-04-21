// ─── Daily Brief / Today's Mission Types ──────────────────────────────────────

export interface DailyTask {
  /** Unique ID for this task — generated as nanoid(8) */
  id: string
  /** What the user should do today */
  title: string
  /** Short context — why this matters today (max 80 chars) */
  context: string
  /** Source of this task */
  source: 'goal' | 'habit' | 'calendar' | 'challenge' | 'missi'
  /** Whether user marked it done */
  completed: boolean
  /** Unix ms when completed, null if not */
  completedAt: number | null
}

export interface DailyBrief {
  /** YYYY-MM-DD — one brief per day */
  date: string
  /** Clerk userId this brief belongs to */
  userId: string
  /** Warm greeting message from Missi (1-2 sentences, Gemini-generated) */
  greeting: string
  /** Up to 3 tasks for today */
  tasks: DailyTask[]
  /** Streak encouragement line (Gemini-generated, max 100 chars) */
  streakNudge: string | null
  /** Mood check-in prompt based on yesterday (Gemini-generated, max 80 chars) */
  moodPrompt: string | null
  /** Mini-challenge for today (Gemini-generated, max 120 chars) */
  challenge: string | null
  /** Whether the user has opened/acknowledged the brief today */
  viewed: boolean
  /** Unix ms when the brief was generated */
  generatedAt: number
  /** Unix ms when user first viewed it */
  viewedAt: number | null
}

export interface BriefGenerationContext {
  userName: string
  topGoals: string[]           // max 3 goal node titles
  activeHabits: string[]       // habits with currentStreak > 0, titles only
  bestStreak: { title: string; days: number } | null
  yesterdayMood: string | null // mood label from yesterday, or null
  calendarEvents: string[]     // today's event titles from Google Calendar, or []
  loginStreak: number
  /** User's local hour (0-23) from browser — for time-appropriate greetings */
  localHour?: number
  /** User's IANA timezone (e.g. "Asia/Kolkata") from browser */
  timezone?: string
}
