// ─── Budget Buddy Types ───────────────────────────────────────────────────────

export const VALID_EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'groceries',
  'entertainment',
  'health',
  'shopping',
  'utilities',
  'education',
  'travel',
  'housing',
  'subscriptions',
  'gifts',
  'other',
] as const

export type ExpenseCategory = (typeof VALID_EXPENSE_CATEGORIES)[number]

export interface ExpenseEntry {
  id: string
  userId: string
  amount: number
  currency: string
  category: ExpenseCategory
  description: string
  date: string // YYYY-MM-DD
  createdAt: number // unix ms
  updatedAt: number // unix ms
  source: 'manual' | 'agent'
  note?: string
}

export interface BudgetLimit {
  category: ExpenseCategory
  amount: number
  currency: string
}

export interface BudgetSettings {
  userId: string
  preferredCurrency: string
  defaultView: BudgetTab
  limits: BudgetLimit[]
  updatedAt: number // unix ms
}

export interface SpendingInsight {
  month: string // YYYY-MM
  currency: string
  generatedAt: number // unix ms
  summary: string
  topCategory: ExpenseCategory | null
  topCategoryAmount: number
  comparisonText: string | null
  suggestions: string[]
  aiGenerated: boolean
}

export interface MonthlyReport {
  month: string // YYYY-MM
  currency: string
  total: number
  previousMonthTotal: number | null
  byCategory: Record<ExpenseCategory, number>
  topCategories: { category: ExpenseCategory; amount: number; pct: number }[]
  entryCount: number
  averagePerEntry: number
  budgetVsActual: { category: ExpenseCategory; budget: number; actual: number; remaining: number }[]
}

export interface BudgetExportRow {
  date: string
  category: string
  amount: number
  currency: string
  description: string
}

export type BudgetTab = 'overview' | 'entries' | 'budgets' | 'insights' | 'settings'

export interface BudgetDashboardData {
  settings: BudgetSettings | null
  currentMonth: MonthlyReport
  previousMonth: MonthlyReport | null
  insight: SpendingInsight | null
  recentEntries: ExpenseEntry[]
}
