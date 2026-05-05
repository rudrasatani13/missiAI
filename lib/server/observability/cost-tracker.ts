// Server-only utilities for cost tracking

// ─── Cost Tracker ─────────────────────────────────────────────────────────────
//
// Tracks per-request costs (Gemini tokens + TTS characters) and
// checks a daily budget threshold backed by KV.

import { MODEL_COSTS } from "@/lib/ai/providers/model-router"
import { log } from "@/lib/server/observability/logger"
import type { KVStore } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RequestCost {
  userId: string
  model: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  ttsChars: number
  ttsCostUsd: number
  totalCostUsd: number
  timestamp: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const COST_CONSTANTS = {
  /** Estimated TTS cost placeholder per character */
  TTS_COST_PER_CHAR: 0.0000003,
} as const

// ─── Daily budget (configurable via env) ──────────────────────────────────────

function parseBudget(): number {
  if (typeof process !== "undefined" && process.env?.DAILY_BUDGET_USD) {
    const parsed = parseFloat(process.env.DAILY_BUDGET_USD)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }
  return 5.0
}

export const DAILY_BUDGET_USD: number = parseBudget()

// ─── Cost calculation ─────────────────────────────────────────────────────────

/**
 * Calculate the total cost for a single request (Gemini + TTS).
 *
 * Returns all cost fields except `userId` and `timestamp` — those are added
 * by the caller who has request context.
 */
export function calculateTotalCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  ttsChars: number,
): Pick<
  RequestCost,
  "model" | "inputTokens" | "outputTokens" | "costUsd" | "ttsChars" | "ttsCostUsd" | "totalCostUsd"
> {
  const costs =
    MODEL_COSTS[model as keyof typeof MODEL_COSTS] ??
    MODEL_COSTS["gemini-3-flash-preview"]

  const inputCost = (inputTokens / 1000) * costs.input
  const outputCost = (outputTokens / 1000) * costs.output
  const costUsd = inputCost + outputCost

  const ttsCostUsd = ttsChars * COST_CONSTANTS.TTS_COST_PER_CHAR
  const totalCostUsd = costUsd + ttsCostUsd

  return {
    model,
    inputTokens,
    outputTokens,
    costUsd,
    ttsChars,
    ttsCostUsd,
    totalCostUsd,
  }
}

// ─── Hard budget enforcement ──────────────────────────────────────────────────
//
// When HARD_BUDGET_ENABLED=true (default) the daily spend accumulated in KV
// acts as a hard kill switch: requests are rejected once the daily budget is
// exhausted.
//
// Spend tracking is best-effort KV (non-atomic). A small window of TOCTOU
// over-spending is acceptable; this is a cost-control safety net, not a
// billing system. For stricter enforcement, wire up the Durable Object
// atomic counter instead.

/** Hard budget enforcement — set HARD_BUDGET_ENABLED=false to disable. */
export const HARD_BUDGET_ENABLED: boolean =
  process.env.HARD_BUDGET_ENABLED !== "false"

/** Per-day accumulator key — resets automatically via TTL. */
function getDailySpendKey(): string {
  const today = new Date().toISOString().slice(0, 10)
  return `budget:cost:daily:${today}`
}

/** Read the accumulated daily spend in USD from KV. Returns 0 on miss or error. */
export async function getDailySpend(kv: KVStore): Promise<number> {
  try {
    const raw = await kv.get(getDailySpendKey())
    if (!raw) return 0
    const val = parseFloat(raw)
    return Number.isFinite(val) && val >= 0 ? val : 0
  } catch {
    return 0
  }
}

/**
 * Increment the daily spend counter after a completed request.
 * Best-effort: silently swallows KV errors so callers are never blocked.
 * TOCTOU race window is accepted — this is a cost guardrail, not billing.
 */
export async function incrementDailySpend(kv: KVStore, costUsd: number): Promise<void> {
  if (costUsd <= 0) return
  try {
    const key = getDailySpendKey()
    const current = await getDailySpend(kv)
    // 25-hour TTL so the key self-expires after the day rolls over.
    await kv.put(key, (current + costUsd).toFixed(8), { expirationTtl: 90_000 })
  } catch {
    // Best-effort — do not surface KV failures to callers.
  }
}

export interface BudgetCheckResult {
  allowed: boolean
  spendUsd: number
  budgetUsd: number
  unavailable?: boolean
}

/**
 * Hard budget gate — call this BEFORE making an AI provider call.
 *
 * Returns `{ allowed: false }` when:
 *   - daily budget is already exhausted, OR
 *   - KV is unavailable in production (fail-closed).
 *
 * In non-production environments with no KV, always allows (dev-friendly).
 */
export async function checkHardBudget(
  kv: KVStore | null,
  estimatedCostUsd: number,
): Promise<BudgetCheckResult> {
  if (!HARD_BUDGET_ENABLED) {
    return { allowed: true, spendUsd: 0, budgetUsd: DAILY_BUDGET_USD }
  }
  if (!kv) {
    const isProduction = process.env.NODE_ENV === "production"
    return {
      allowed: !isProduction,
      spendUsd: 0,
      budgetUsd: DAILY_BUDGET_USD,
      unavailable: isProduction,
    }
  }
  const spendUsd = await getDailySpend(kv)
  return {
    allowed: spendUsd + estimatedCostUsd <= DAILY_BUDGET_USD,
    spendUsd,
    budgetUsd: DAILY_BUDGET_USD,
  }
}

// ─── Budget alert (observability) ─────────────────────────────────────────────

/**
 * Check whether the accumulated daily spend has crossed the budget threshold
 * and emit a warn-level log if so. Pure observability — does not block.
 */
export async function checkBudgetAlert(kv: KVStore | null): Promise<boolean> {
  if (!kv) return false
  const spendUsd = await getDailySpend(kv)
  if (spendUsd <= DAILY_BUDGET_USD) return false

  log({
    level: "warn",
    event: "budget.threshold_crossed",
    metadata: {
      dailyCostSoFar: Number(spendUsd.toFixed(6)),
      budgetUsd: DAILY_BUDGET_USD,
    },
    timestamp: Date.now(),
  })

  return true
}
