import { nanoid } from "nanoid"
import { geminiGenerate } from "./vertex-client"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentPlanStep {
  stepNumber: number
  toolName: string
  description: string
  isDestructive: boolean
  estimatedDuration: string
  args?: Record<string, unknown>
}

export interface AgentPlan {
  planId: string
  steps: AgentPlanStep[]
  summary: string
  requiresConfirmation: boolean
  estimatedSteps: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Tools that modify external state and require user confirmation */
export const DESTRUCTIVE_TOOLS = new Set([
  "createCalendarEvent",
  "createNote",
  "draftEmail",
  "sendEmail",
  "logExpense",
  "updateGoalProgress",
  "takeNote",
  "setReminder",
  "saveContact",
  "updateCalendarEvent",
  "deleteCalendarEvent",
])

const PLANNING_MODEL = "gemini-2.5-pro"
const PLAN_TIMEOUT_MS = 15_000
const MAX_PLAN_STEPS = 5

// ─── Fallback plan ────────────────────────────────────────────────────────────

function fallbackPlan(): AgentPlan {
  return {
    planId: nanoid(12),
    steps: [],
    summary: "I'll take care of that right away",
    requiresConfirmation: false,
    estimatedSteps: 0,
  }
}

// ─── Main function ────────────────────────────────────────────────────────────

/**
 * Ask Gemini to generate a structured step-by-step plan for the user's request.
 * Returns a fallback plan on timeout or parse failure.
 */
export async function buildAgentPlan(
  userMessage: string,
  availableTools: string[],
  memoryContext: string
): Promise<AgentPlan> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PLAN_TIMEOUT_MS)

  const systemPrompt = `You are Missi's planning module. Given a user request and available tools, create a step-by-step action plan.

Available tools: ${availableTools.join(", ")}

User memory context (use to personalize the plan):
${memoryContext.slice(0, 500)}

Respond ONLY with valid JSON — no markdown, no explanation, just the JSON object.

Required JSON shape:
{
  "steps": [
    {
      "stepNumber": 1,
      "toolName": "exactToolName",
      "description": "Plain English description of what this step does (max 80 chars)",
      "isDestructive": true,
      "estimatedDuration": "~2s",
      "args": {}
    }
  ],
  "summary": "Short sentence summarizing the full plan (max 100 chars)"
}

Rules:
- Only use tools from the available tools list exactly as written
- Maximum ${MAX_PLAN_STEPS} steps per plan
- Mark isDestructive true for: createCalendarEvent, createNote, draftEmail, logExpense, updateGoalProgress, takeNote, setReminder
- Mark isDestructive false for: searchMemory, readCalendar, searchWeb, getWeekSummary
- The args object should contain the tool arguments Gemini would call with, based on the user's request
- If the request cannot be fulfilled with available tools, return: {"steps": [], "summary": "I can't do that yet"}
- Keep descriptions friendly and in second person ("Check your calendar", "Create the event")`

  const requestBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
      // Keep thinking minimal for this structured JSON task
      thinkingConfig: { thinkingBudget: 128 },
    },
  }

  try {
    const response = await geminiGenerate(PLANNING_MODEL, requestBody as Record<string, unknown>, {
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const errText = await response.text().catch(() => "")
      console.error(`[agent-planner] Gemini API ${response.status}: ${errText.slice(0, 300)}`)
      return fallbackPlan()
    }

    const data = await response.json() as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> }
      }>
    }

    // Log all parts for debugging
    const parts = data?.candidates?.[0]?.content?.parts ?? []
    console.log(`[agent-planner] Got ${parts.length} parts:`, parts.map((p, i) => `part${i}(thought=${p.thought}, len=${p.text?.length ?? 0})`).join(", "))

    // Try the last part first, then all parts — find the one with JSON
    const allText = parts.map(p => p.text ?? "").join("\n")
    const plan = parsePlanResponse(allText, availableTools)
    console.log(`[agent-planner] Parsed plan: ${plan.steps.length} steps, summary: ${plan.summary}`)
    return plan
  } catch (err) {
    clearTimeout(timeout)
    console.error("[agent-planner] Planning error:", err)
    return fallbackPlan()
  }
}

// ─── Response parser ──────────────────────────────────────────────────────────

function parsePlanResponse(rawText: string, availableTools: string[]): AgentPlan {
  try {
    // Extract JSON robustly — find the first { and last } in the text
    const firstBrace = rawText.indexOf("{")
    const lastBrace = rawText.lastIndexOf("}")
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      console.error("[agent-planner] No JSON object found in response")
      return fallbackPlan()
    }
    const cleaned = rawText.slice(firstBrace, lastBrace + 1)

    const parsed = JSON.parse(cleaned) as {
      steps?: unknown[]
      summary?: string
    }

    if (!parsed || typeof parsed !== "object") return fallbackPlan()

    const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : []
    const summary = typeof parsed.summary === "string" ? parsed.summary.slice(0, 100) : "I'll handle that"

    // Validate, sanitize, and cap steps
    const validToolSet = new Set(availableTools)
    const steps: AgentPlanStep[] = rawSteps
      .slice(0, MAX_PLAN_STEPS)
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .filter((s) => typeof s.toolName === "string" && validToolSet.has(s.toolName))
      .map((s, idx) => ({
        stepNumber: idx + 1,
        toolName: String(s.toolName),
        description: String(s.description || "").slice(0, 80) || `Step ${idx + 1}`,
        isDestructive: DESTRUCTIVE_TOOLS.has(String(s.toolName)),
        estimatedDuration: String(s.estimatedDuration || "~2s").slice(0, 20),
        args: (typeof s.args === "object" && s.args !== null && !Array.isArray(s.args))
          ? (s.args as Record<string, unknown>)
          : {},
      }))

    const requiresConfirmation = false // User requested direct execution for all tasks without confirmation

    return {
      planId: nanoid(12),
      steps,
      summary,
      requiresConfirmation,
      estimatedSteps: steps.length,
    }
  } catch {
    return fallbackPlan()
  }
}
