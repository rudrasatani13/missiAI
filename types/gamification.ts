// ─── Gamification Types ───────────────────────────────────────────────────────

export interface HabitStreak {
  nodeId: string        // matches LifeNode.id
  title: string         // snapshot of LifeNode.title at check-in time
  currentStreak: number // consecutive days checked in (resets on miss)
  longestStreak: number // all-time personal best
  lastCheckedIn: string // YYYY-MM-DD of last check-in (or '' if never)
  totalCheckIns: number // lifetime total
}

// ─── Avatar Tiers ─────────────────────────────────────────────────────────────

export type AvatarTier = 1 | 2 | 3 | 4 | 5 | 6

export interface AvatarTierInfo {
  tier: AvatarTier
  name: string
  xpRequired: number
  colorStart: string   // gradient start color (HSL)
  colorEnd: string     // gradient end color (HSL)
}

export const AVATAR_TIERS: AvatarTierInfo[] = [
  { tier: 1, name: "Spark",   xpRequired: 0,     colorStart: "hsl(0, 0%, 55%)",   colorEnd: "hsl(0, 0%, 75%)" },
  { tier: 2, name: "Ember",   xpRequired: 100,   colorStart: "hsl(30, 60%, 50%)",  colorEnd: "hsl(45, 70%, 65%)" },
  { tier: 3, name: "Flame",   xpRequired: 500,   colorStart: "hsl(15, 80%, 55%)",  colorEnd: "hsl(35, 90%, 65%)" },
  { tier: 4, name: "Nova",    xpRequired: 1500,  colorStart: "hsl(260, 60%, 55%)", colorEnd: "hsl(280, 70%, 70%)" },
  { tier: 5, name: "Stellar", xpRequired: 5000,  colorStart: "hsl(200, 70%, 55%)", colorEnd: "hsl(320, 60%, 65%)" },
  { tier: 6, name: "Cosmic",  xpRequired: 15000, colorStart: "hsl(280, 80%, 55%)", colorEnd: "hsl(180, 70%, 60%)" },
]

// ─── Achievements ─────────────────────────────────────────────────────────────

export interface Achievement {
  id: string
  title: string
  description: string
  xpBonus: number
  unlockedAt: number | null  // unix ms, null = locked
}

export interface GamificationStateRecord {
  userId: string
  totalXPBaseline: number
  loginStreak: number
  lastLoginDate: string
  legacyTodayXPLogDate: string
  legacyTodayXPLog: XPLogEntry[]
  lastUpdatedAt: number
}

export interface GamificationGrantRecord extends XPLogEntry {
  userId: string
  date: string
}

// ─── XP Log Entry ─────────────────────────────────────────────────────────────

export type XPSource = 'checkin' | 'milestone' | 'chat' | 'memory' | 'agent' | 'login' | 'achievement' | 'budget'

export interface XPLogEntry {
  source: XPSource
  amount: number
  timestamp: number
}

// ─── Main Gamification Data ───────────────────────────────────────────────────

export interface GamificationData {
  userId: string
  totalXP: number
  level: number          // Math.floor(totalXP / 100), min 1
  avatarTier: AvatarTier
  habits: HabitStreak[]  // one entry per tracked habit node
  achievements: Achievement[]
  xpLog: XPLogEntry[]    // today's XP history (reset daily)
  xpLogDate: string      // YYYY-MM-DD of the xpLog entries
  loginStreak: number    // consecutive days the user has logged in
  lastLoginDate: string  // YYYY-MM-DD
  lastUpdatedAt: number  // unix ms
}

export interface CheckInResult {
  habit: HabitStreak
  xpEarned: number
  milestone: number | null  // 7 | 30 | 100 | null
  celebrationText: string | null
  totalXP: number
  level: number
  avatarTier: AvatarTier
  alreadyCheckedIn: boolean
  newAchievements: Achievement[]
}
