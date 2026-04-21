// ─── Missi Quest Types ────────────────────────────────────────────────────────
//
// Standalone type definitions for the quest system.
// DO NOT merge into types/gamification.ts — that file is frozen.

// ─── Enums (string literal unions) ────────────────────────────────────────────

export type QuestStatus = 'active' | 'completed' | 'abandoned' | 'draft'

export type MissionStatus = 'locked' | 'available' | 'completed'

export type QuestDifficulty = 'easy' | 'medium' | 'hard'

export type QuestCategory =
  | 'health'
  | 'learning'
  | 'creativity'
  | 'relationships'
  | 'career'
  | 'mindfulness'
  | 'other'

// ─── Quest Mission ────────────────────────────────────────────────────────────

export interface QuestMission {
  /** Unique identifier (nanoid 8) */
  id: string
  /** Mission title (max 80 chars) — e.g. "Learn greetings today" */
  title: string
  /** Mission description (max 200 chars) — e.g. "Start with 'hola' and 'buenos días'. Just 5 minutes." */
  description: string
  /** Which chapter this mission belongs to (1-indexed) */
  chapterNumber: number
  /** Mission number within the chapter (1-indexed) */
  missionNumber: number
  /** XP reward: 5, 10, 15, or 25/50 for boss battles */
  xpReward: number
  /** True for the final mission of the last chapter */
  isBoss: boolean
  /** Current mission status */
  status: MissionStatus
  /** Unix ms when completed, or null */
  completedAt: number | null
  /** Unix ms when this mission became available, or null */
  unlockedAt: number | null
}

// ─── Quest Chapter ────────────────────────────────────────────────────────────

export interface QuestChapter {
  /** Chapter number (1-indexed) */
  chapterNumber: number
  /** Chapter title (max 60 chars) — e.g. "Finding Your Voice" */
  title: string
  /** Chapter description (max 200 chars) — e.g. "The first week — where everything begins" */
  description: string
  /** Missions within this chapter */
  missions: QuestMission[]
}

// ─── Quest ────────────────────────────────────────────────────────────────────

export interface Quest {
  /** Unique identifier (nanoid 12) */
  id: string
  /** Owner user ID — ALWAYS from Clerk server-side, never from client */
  userId: string
  /** Quest title (max 80 chars) — e.g. "The Spanish Journey" */
  title: string
  /** The user's goal articulated warmly (max 400 chars) */
  description: string
  /** The LifeNode id this quest is tied to, or null */
  goalNodeId: string | null
  /** Quest category */
  category: QuestCategory
  /** Quest difficulty */
  difficulty: QuestDifficulty
  /** Chapters containing the missions */
  chapters: QuestChapter[]
  /** Current quest status */
  status: QuestStatus
  /** Unix ms when quest was created */
  createdAt: number
  /** Unix ms when quest was started, or null */
  startedAt: number | null
  /** Unix ms when quest was completed, or null */
  completedAt: number | null
  /** How many days the user wants to take */
  targetDurationDays: number
  /** Total missions (denormalized for quick UI display) */
  totalMissions: number
  /** Completed missions (denormalized) */
  completedMissions: number
  /** Running total XP earned from this quest */
  totalXPEarned: number
  /** Single emoji representing the quest */
  coverEmoji: string
}

// ─── Quest Generation Input ───────────────────────────────────────────────────

export interface QuestGenerationInput {
  /** Sanitized user goal description */
  userGoal: string
  /** Auto-detected or user-chosen category */
  category: QuestCategory
  /** User-chosen difficulty */
  difficulty: QuestDifficulty
  /** Target duration in days */
  targetDurationDays: number
  /** User's name from Clerk (optional) */
  userName?: string
  /** Sanitized summary of relevant LifeGraph nodes */
  existingMemoryContext?: string
}

// ─── Boss Battle Token ────────────────────────────────────────────────────────

export interface QuestBossToken {
  /** Quest this token is for */
  questId: string
  /** User this token was issued to */
  userId: string
  /** Unix ms when token was issued */
  issuedAt: number
  /** HMAC-SHA256 hex signature */
  signature: string
}

// ─── Quest Achievement Context ────────────────────────────────────────────────

export interface QuestAchievementContext {
  /** Quest that was just completed */
  questJustCompleted?: Quest
  /** Mission that was just completed */
  missionJustCompleted?: QuestMission
  /** Chapter that was just completed (all missions done) */
  chapterJustCompleted?: { questId: string; chapterNumber: number }
  /** Quest that was just started */
  questJustStarted?: Quest
}

// ─── Quest Stats ──────────────────────────────────────────────────────────────

export interface QuestStats {
  totalQuests: number
  activeQuests: number
  completedQuests: number
  abandonedQuests: number
  totalMissionsCompleted: number
  totalQuestXP: number
  bossesDefeated: number
}

// ─── Gemini Response Shape (for parsing) ──────────────────────────────────────

export interface GeminiQuestResponse {
  title: string
  description: string
  coverEmoji: string
  chapters: Array<{
    chapterNumber: number
    title: string
    description: string
    missions: Array<{
      missionNumber: number
      title: string
      description: string
      isBoss: boolean
    }>
  }>
}
