// ─── Budget Buddy XP Awarding ───────────────────────────────────────────────────

import type { KVStore } from '@/types'
import { awardXP } from './xp-engine'

const XP_PER_ENTRY = 5
const MAX_DAILY_BUDGET_XP = 15 // 3 entries per day

/**
 * Award XP for tracking an expense entry.
 * Fire-and-forget from API routes:
 *   awardBudgetXP(kv, userId).catch(() => {})
 */
export async function awardBudgetXP(
  kv: KVStore,
  userId: string,
): Promise<number> {
  return awardXP(kv, userId, 'budget', XP_PER_ENTRY)
}
