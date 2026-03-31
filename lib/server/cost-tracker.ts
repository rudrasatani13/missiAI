// Server-only utilities
"use server"

// ─── Cost Tracker ─────────────────────────────────────────────────────────────
//
// Tracks per-request costs (Gemini tokens + ElevenLabs TTS characters) and
// checks a daily budget threshold backed by KV.

import { MODEL_COSTS } from "@/lib/ai/model-router"
import { log } from "@/lib/server/logger"
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
  /** ElevenLabs ~$0.30 per 1 000 chars → $0.0000003 per char */
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
    MODEL_COSTS["gemini-2.5-pro"]

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

// ─── Budget alert ─────────────────────────────────────────────────────────────

const BUDGET_KV_KEY = "budget:daily_total"

/**
 * Check whether the daily spend has crossed the budget threshold.
 *
 * `dailyCostSoFar` is the accumulated cost for the current day (the caller
 * is responsible for summing it — this function just compares).
 *
 * Returns `true` when the budget is exceeded, and emits a warn-level log.
 */
export async function checkBudgetAlert(
  kv: KVStore | null,
  dailyCostSoFar: number,
): Promise<boolean> {
  if (dailyCostSoFar <= DAILY_BUDGET_USD) return false

  log({
    level: "warn",
    event: "budget.threshold_crossed",
    metadata: {
      dailyCostSoFar: Number(dailyCostSoFar.toFixed(6)),
      budgetUsd: DAILY_BUDGET_USD,
    },
    timestamp: Date.now(),
  })

  // Persist the alert flag to KV so dashboards / cron can pick it up
  if (kv) {
    try {
      await kv.put(
        BUDGET_KV_KEY,
        JSON.stringify({
          exceeded: true,
          dailyCostSoFar: Number(dailyCostSoFar.toFixed(6)),
          budgetUsd: DAILY_BUDGET_USD,
          timestamp: Date.now(),
        }),
      )
    } catch {
      // KV write failure is non-critical — the warn log is already emitted
    }
  }

  return true
}
