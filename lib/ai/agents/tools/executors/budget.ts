import { nanoid } from "nanoid"
import type { AgentToolCall, AgentStepResult, ToolContext } from "@/lib/ai/agents/tools/types"
import { abortedToolResult, VALID_EXPENSE_CATEGORIES } from "@/lib/ai/agents/tools/shared"
import { addExpenseEntry } from "@/lib/budget/budget-store"
import { validateCurrency } from "@/lib/budget/currency"
import { addOrUpdateNode } from "@/lib/memory/life-graph"
import { stripHtml } from "@/lib/validation/sanitizer"
import type { ExpenseCategory } from "@/types/budget"

export async function executeBudgetTool(
  call: AgentToolCall,
  ctx: ToolContext,
): Promise<AgentStepResult | null> {
  const { name, args } = call

  if (name !== "logExpense") {
    return null
  }

  if (!ctx.kv) {
    return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot log expense — storage is not connected." }
  }

  const amount = Math.abs(Number(args.amount) || 0)
  if (amount === 0) {
    return { toolName: name, status: "error", summary: "Invalid amount", output: "Please provide a valid expense amount." }
  }
  const currency = validateCurrency(String(args.currency || "INR"))
  if (!currency) {
    return { toolName: name, status: "error", summary: "Unsupported currency", output: "Please provide a supported currency code." }
  }
  const rawCategory = String(args.category || "other")
  const category = (VALID_EXPENSE_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : "other"
  const description = stripHtml(String(args.description || "")).slice(0, 100) || "Expense"
  const today = new Date().toISOString().split("T")[0]
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || "")) ? String(args.date) : today
  const timestamp = Date.now()
  const abortedBeforeEntry = abortedToolResult(name, ctx)
  if (abortedBeforeEntry) return abortedBeforeEntry

  await addExpenseEntry(ctx.kv, ctx.userId, {
    id: `bgt-${timestamp.toString(36)}-${nanoid(6)}`,
    userId: ctx.userId,
    amount,
    currency,
    category: category as ExpenseCategory,
    description,
    date,
    createdAt: timestamp,
    updatedAt: timestamp,
    source: "agent",
    note: undefined,
  })

  const abortedBeforeMemory = abortedToolResult(name, ctx)
  if (abortedBeforeMemory) return abortedBeforeMemory

  await addOrUpdateNode(
    ctx.kv,
    ctx.vectorizeEnv,
    ctx.userId,
    {
      userId: ctx.userId,
      category: "event",
      title: `Expense: ${description}`,
      detail: `Amount: ${amount} ${currency} on ${date}. Category: ${category}. Note: ${description}`,
      tags: ["expense", category, currency.toLowerCase()],
      people: [],
      emotionalWeight: 0.2,
      confidence: 0.9,
      source: "explicit",
    },
  )

  return {
    toolName: name,
    status: "done",
    summary: `Logged ${currency} ${amount} on ${description}`,
    output: `Expense logged: ${amount} ${currency} spent on ${description} (${category}) on ${date}.`,
  }
}
