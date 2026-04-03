// ─── Gamification Types ───────────────────────────────────────────────────────

export interface HabitStreak {
  nodeId: string        // matches LifeNode.id
  title: string         // snapshot of LifeNode.title at check-in time
  currentStreak: number // consecutive days checked in (resets on miss)
  longestStreak: number // all-time personal best
  lastCheckedIn: string // YYYY-MM-DD of last check-in (or '' if never)
  totalCheckIns: number // lifetime total
}

export interface GamificationData {
  userId: string
  totalXP: number
  level: number          // Math.floor(totalXP / 100), min 1
  habits: HabitStreak[]  // one entry per tracked habit node
  lastUpdatedAt: number  // unix ms
}

export interface CheckInResult {
  habit: HabitStreak
  xpEarned: number
  milestone: number | null  // 7 | 30 | 100 | null
  celebrationText: string | null
  totalXP: number
  level: number
  alreadyCheckedIn: boolean
}
