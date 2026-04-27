// ─── Budget Buddy AI Insight Generator ──────────────────────────────────────────

import type { KVStore } from '@/types'
import type { SpendingInsight, ExpenseCategory } from '@/types/budget'
import { callGeminiDirect } from '@/lib/ai/services/ai-service'
import { sanitizeMemories } from '@/lib/memory/memory-sanitizer'
import { buildMonthlyReport, cacheInsight, getCachedInsight } from './budget-store'

const GENERATION_TIMEOUT_MS = 20_000
const MAX_INSIGHT_LEN = 2000

// ─── Mechanical Analysis ──────────────────────────────────────────────────────

interface MechanicalAnalysis {
  total: number
  categoryTotals: Record<string, number>
  previousTotal: number | null
  biggestCategory: string | null
  biggestAmount: number
  monthOverMonthChange: number | null // pct
  top3: { category: string; amount: number; pct: number }[]
}

function analyzeSpending(report: Awaited<ReturnType<typeof buildMonthlyReport>>): MechanicalAnalysis {
  const entries = Object.entries(report.byCategory)
  const sorted = entries.sort(([, a], [, b]) => b - a)
  const total = report.total
  const top3 = sorted.slice(0, 3).map(([cat, amount]) => ({
    category: cat,
    amount,
    pct: total > 0 ? (amount / total) * 100 : 0,
  }))
  const biggest = sorted[0]
  const previousTotal = report.previousMonthTotal
  return {
    total,
    categoryTotals: report.byCategory,
    previousTotal,
    biggestCategory: biggest ? biggest[0] : null,
    biggestAmount: biggest ? biggest[1] : 0,
    monthOverMonthChange:
      previousTotal !== null && previousTotal > 0
        ? ((total - previousTotal) / previousTotal) * 100
        : null,
    top3,
  }
}

// ─── Prompt Builder ─────────────────────────────────────────────────────────────

function buildInsightPrompt(
  analysis: MechanicalAnalysis,
  currency: string,
): string {
  const lines = [
    `Total spending: ${currency} ${analysis.total.toFixed(2)}`,
    '',
    'Top categories:',
  ]
  for (const t of analysis.top3) {
    lines.push(`- ${t.category}: ${currency} ${t.amount.toFixed(2)} (${t.pct.toFixed(1)}%)`)
  }
  if (analysis.monthOverMonthChange !== null) {
    lines.push(
      '',
      `Month-over-month change: ${analysis.monthOverMonthChange > 0 ? '+' : ''}${analysis.monthOverMonthChange.toFixed(1)}%`,
    )
  }
  return lines.join('\n')
}

const SYSTEM_PROMPT = `You are a personal finance insight assistant.

TASK: Based on the user's monthly spending summary below, generate a concise, helpful spending insight.

RULES — NEVER VIOLATE:
- Respond ONLY in clear, friendly English.
- Keep it to 2-4 short sentences.
- Highlight the biggest category and any notable change vs last month.
- Offer ONE practical, actionable tip to reduce spending or improve habits.
- NEVER provide investment advice, tax advice, stock picks, market predictions, or financial planning beyond simple budgeting tips.
- NEVER ask the user for additional personal data.
- Do NOT use markdown formatting, bullet points, or headers. Plain text only.
- Do NOT mention specific merchant names, card numbers, or transaction IDs — only category-level totals.`

// ─── Fallback Insight ───────────────────────────────────────────────────────────

function buildFallbackInsight(
  analysis: MechanicalAnalysis,
  currency: string,
): string {
  const parts: string[] = []
  if (analysis.biggestCategory) {
    parts.push(
      `Your biggest spending area this month was ${analysis.biggestCategory} at ${currency} ${analysis.biggestAmount.toFixed(2)}.`,
    )
  }
  if (analysis.monthOverMonthChange !== null) {
    const direction = analysis.monthOverMonthChange > 0 ? 'up' : 'down'
    parts.push(
      `That's ${direction} ${Math.abs(analysis.monthOverMonthChange).toFixed(1)}% compared to last month.`,
    )
  }
  if (analysis.total === 0) {
    parts.push('No expenses were tracked this month — consider logging your first entry.')
  } else {
    parts.push('Try reviewing your top category for any easy cutbacks.')
  }
  return parts.join(' ')
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateSpendingInsight(
  kv: KVStore,
  userId: string,
  yearMonth: string,
  force = false,
): Promise<SpendingInsight> {
  // Return cached insight unless force regeneration
  if (!force) {
    const cached = await getCachedInsight(kv, userId, yearMonth)
    if (cached) return cached
  }

  const report = await buildMonthlyReport(kv, userId, yearMonth)
  const analysis = analyzeSpending(report)
  const currency = report.currency

  let summary: string
  let aiGenerated = false

  try {
    const prompt = buildInsightPrompt(analysis, currency)
    const raw = await callGeminiDirect(SYSTEM_PROMPT, prompt, {
      model: 'gemini-2.5-flash',
      temperature: 0.5,
      maxOutputTokens: 512,
      timeoutMs: GENERATION_TIMEOUT_MS,
      useGoogleSearch: false,
    })

    const sanitized = sanitizeMemories(raw).slice(0, MAX_INSIGHT_LEN).trim()
    if (sanitized.length > 20) {
      summary = sanitized
      aiGenerated = true
    } else {
      summary = buildFallbackInsight(analysis, currency)
    }
  } catch {
    summary = buildFallbackInsight(analysis, currency)
  }

  const suggestions = buildSuggestions(analysis, currency)

  const insight: SpendingInsight = {
    month: yearMonth,
    currency,
    generatedAt: Date.now(),
    summary,
    topCategory: (analysis.biggestCategory as ExpenseCategory) ?? null,
    topCategoryAmount: analysis.biggestAmount,
    comparisonText:
      analysis.monthOverMonthChange !== null
        ? `${analysis.monthOverMonthChange > 0 ? '+' : ''}${analysis.monthOverMonthChange.toFixed(1)}% vs last month`
        : null,
    suggestions,
    aiGenerated,
  }

  await cacheInsight(kv, userId, insight)
  return insight
}

function buildSuggestions(
  analysis: MechanicalAnalysis,
  _currency: string,
): string[] {
  const suggestions: string[] = []
  if (analysis.total === 0) {
    suggestions.push('Start logging daily expenses to build awareness.')
    return suggestions
  }
  if (analysis.biggestCategory === 'food' || analysis.biggestCategory === 'groceries') {
    suggestions.push('Cooking at home a few more times per week can noticeably reduce food spending.')
  }
  if (analysis.biggestCategory === 'subscriptions') {
    suggestions.push('Review recurring subscriptions — cancel ones you have not used recently.')
  }
  if (analysis.biggestCategory === 'shopping') {
    suggestions.push('Try a 48-hour waiting rule for non-essential purchases.')
  }
  if (analysis.monthOverMonthChange !== null && analysis.monthOverMonthChange > 20) {
    suggestions.push('Spending increased significantly this month — check for one-time large purchases.')
  }
  if (suggestions.length === 0) {
    suggestions.push('Set a weekly spending review to stay on track with your budget.')
  }
  return suggestions.slice(0, 3)
}
