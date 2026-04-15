import { geminiGenerateStream } from "@/lib/ai/vertex-client"
import { AGENT_FUNCTION_DECLARATIONS } from "./agent-tools"
import { callAIDirect } from "@/services/ai.service"

export interface AgentPlanStep {
  stepNumber: number
  toolName: string
  description: string
  isDestructive: boolean
  estimatedDuration: string
}

export interface AgentPlan {
  steps: AgentPlanStep[]
  summary: string
  requiresConfirmation: boolean
  estimatedSteps: number
  planId: string
}

const DESTRUCTIVE_TOOLS = new Set([
  "createCalendarEvent",
  "createNote",
  "draftEmail",
  "logExpense",
  "updateGoalProgress",
  "takeNote",
  "setReminder"
])

/**
 * Builds a multi-step agent plan for a user request using Gemini.
 */
export async function buildAgentPlan(
  userMessage: string,
  availableTools: string[],
  memoryContext: string,
  geminiApiKey: string
): Promise<AgentPlan> {
  const planId = Math.random().toString(36).substring(2, 14) // basic nanoid equivalent
  const fallbackPlan: AgentPlan = {
    steps: [],
    summary: "I'll take care of that right away",
    requiresConfirmation: false,
    estimatedSteps: 0,
    planId
  }

  const toolNamesStr = availableTools.join(", ")

  const systemPrompt = `You are Missi's planning module. Given a user request and available tools, create a step-by-step action plan. Respond ONLY with valid JSON matching the exact schema provided.
Available tools: [${toolNamesStr}]
User memory context: [${memoryContext.slice(0, 500)}]

Return this exact JSON shape:
{
  "steps": [
    {
      "stepNumber": 1,
      "toolName": "toolName",
      "description": "What this step does in plain language",
      "isDestructive": true/false,
      "estimatedDuration": "~2s"
    }
  ],
  "summary": "Short sentence summarizing the full plan (max 100 chars)",
  "requiresConfirmation": true if ANY step isDestructive
}

Rules:
* Only use tools from the available tools list
* Maximum 5 steps per plan
* Mark isDestructive true for: ${Array.from(DESTRUCTIVE_TOOLS).join(', ')}
* Mark isDestructive false for: searchMemory, readCalendar, searchWeb, getWeekSummary
* If the request cannot be fulfilled with available tools, return { "steps": [], "summary": "I can't do that yet", "requiresConfirmation": false }`

  try {
    const promise = callAIDirect(systemPrompt, userMessage, {
      temperature: 0.1,
      maxOutputTokens: 500,
      useGoogleSearch: false
    })

    // Timeout of 4 seconds
    const rawResult = await Promise.race([
      promise,
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000))
    ])

    const cleaned = rawResult.replace(/```(?:json)?/gi, "").trim()
    const parsed = JSON.parse(cleaned)

    if (Array.isArray(parsed.steps)) {
      const steps: AgentPlanStep[] = []
      let requiresConfirmation = false

      for (const s of parsed.steps.slice(0, 5)) { // Max 5 steps
        const step: AgentPlanStep = {
          stepNumber: Number(s.stepNumber) || steps.length + 1,
          toolName: String(s.toolName || ""),
          description: String(s.description || ""),
          isDestructive: Boolean(s.isDestructive) || DESTRUCTIVE_TOOLS.has(String(s.toolName)),
          estimatedDuration: String(s.estimatedDuration || "~2s")
        }
        if (step.isDestructive) requiresConfirmation = true
        steps.push(step)
      }

      return {
        steps,
        summary: String(parsed.summary || "Here is the plan"),
        requiresConfirmation: Boolean(parsed.requiresConfirmation) || requiresConfirmation,
        estimatedSteps: steps.length,
        planId
      }
    }
  } catch (error) {
    console.error("[Agent Planner] Failed to build plan", error)
  }

  return fallbackPlan
}
