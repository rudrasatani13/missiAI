/**
 * Agentic Tool Definitions & Executor
 *
 * Defines the function declarations that Gemini can autonomously call,
 * and the executor map that runs them against existing KV / plugin infra.
 */

import { searchLifeGraph, formatLifeGraphForPrompt } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { KVStore } from "@/types"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AgentToolCall {
  name: string
  args: Record<string, unknown>
}

export interface AgentStepResult {
  toolName: string
  status: "running" | "done" | "error"
  summary: string
  output: string
}

// ─── Gemini Function Declarations ─────────────────────────────────────────────
// These are injected into the Gemini request so the model can autonomously
// decide to call them during a conversation.

export const AGENT_FUNCTION_DECLARATIONS = [
  {
    name: "searchMemory",
    description:
      "Search the user's personal memory graph (LifeGraph) for relevant context about their life, preferences, past conversations, or facts they've shared. Use this when the user asks about something they may have told you before, or when you need personal context to give a better answer.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant memories. Be specific — e.g. 'favorite color', 'trip to paris', 'work schedule'.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "setReminder",
    description:
      "Set a reminder for the user. Use when the user explicitly asks to be reminded about something at a specific time or generally.",
    parameters: {
      type: "object",
      properties: {
        task: {
          type: "string",
          description: "What to remind the user about.",
        },
        time: {
          type: "string",
          description: "When to remind — natural language like 'tomorrow at 9am', 'in 2 hours', 'next Monday'.",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "takeNote",
    description:
      "Save a note or idea for the user. Use when the user wants to capture a thought, idea, or piece of information for later.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "A short title for the note (2-6 words).",
        },
        content: {
          type: "string",
          description: "The full content of the note.",
        },
      },
      required: ["content"],
    },
  },
]

// ─── Tool Executor ────────────────────────────────────────────────────────────

interface ToolContext {
  kv: KVStore | null
  vectorizeEnv: VectorizeEnv | null
  userId: string
  apiKey: string
}

/**
 * Execute a single tool call from Gemini and return the result.
 */
export async function executeAgentTool(
  call: AgentToolCall,
  ctx: ToolContext,
): Promise<AgentStepResult> {
  const { name, args } = call

  try {
    switch (name) {
      // ── Search Memory ───────────────────────────────────────────────────
      case "searchMemory": {
        if (!ctx.kv) {
          return {
            toolName: name,
            status: "error",
            summary: "Memory storage unavailable",
            output: "No memories found — storage is not connected.",
          }
        }

        const query = (args.query as string) || ""
        const results = await searchLifeGraph(
          ctx.kv,
          ctx.vectorizeEnv,
          ctx.userId,
          query,
          ctx.apiKey,
          { topK: 5 },
        )

        if (results.length === 0) {
          return {
            toolName: name,
            status: "done",
            summary: `No memories found for "${query}"`,
            output: "No relevant memories found for this query.",
          }
        }

        const formatted = formatLifeGraphForPrompt(results)
        return {
          toolName: name,
          status: "done",
          summary: `Found ${results.length} memory nodes`,
          output: formatted,
        }
      }

      // ── Set Reminder ────────────────────────────────────────────────────
      case "setReminder": {
        const task = (args.task as string) || "Untitled reminder"
        const time = (args.time as string) || "unspecified"

        if (ctx.kv) {
          const key = `actions:reminders:${ctx.userId}`
          let reminders: unknown[] = []
          try {
            const raw = await ctx.kv.get(key)
            if (raw) reminders = JSON.parse(raw)
          } catch {}
          reminders.push({
            id: `rem_${Date.now()}`,
            task,
            time,
            createdAt: Date.now(),
          })
          if (reminders.length > 50) reminders = reminders.slice(-50)
          await ctx.kv.put(key, JSON.stringify(reminders))
        }

        return {
          toolName: name,
          status: "done",
          summary: `Reminder set: "${task}"`,
          output: `Reminder created — task: "${task}", time: "${time}"`,
        }
      }

      // ── Take Note ───────────────────────────────────────────────────────
      case "takeNote": {
        const title = (args.title as string) || "Quick Note"
        const content = (args.content as string) || ""

        if (ctx.kv) {
          const key = `actions:notes:${ctx.userId}`
          let notes: unknown[] = []
          try {
            const raw = await ctx.kv.get(key)
            if (raw) notes = JSON.parse(raw)
          } catch {}
          notes.push({
            id: `note_${Date.now()}`,
            title,
            content,
            createdAt: Date.now(),
          })
          if (notes.length > 50) notes = notes.slice(-50)
          await ctx.kv.put(key, JSON.stringify(notes))
        }

        return {
          toolName: name,
          status: "done",
          summary: `Note saved: "${title}"`,
          output: `Note saved — title: "${title}"`,
        }
      }

      // ── Unknown Tool ────────────────────────────────────────────────────
      default:
        return {
          toolName: name,
          status: "error",
          summary: `Unknown tool "${name}"`,
          output: `Tool "${name}" is not recognized.`,
        }
    }
  } catch (err) {
    return {
      toolName: name,
      status: "error",
      summary: `Tool "${name}" failed`,
      output: `Error executing ${name}: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}

// ─── Human-readable label for tool names ──────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  searchMemory: "Searching your memory",
  setReminder: "Setting a reminder",
  takeNote: "Saving a note",
}

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || `Running ${toolName}`
}
