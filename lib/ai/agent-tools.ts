/**
 * Agentic Tool Definitions & Executor
 *
 * Defines the function declarations that Gemini can autonomously call,
 * and the executor map that runs them against existing KV / plugin infra.
 */

import { searchLifeGraph, formatLifeGraphForPrompt, addOrUpdateNode, getLifeGraph } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { KVStore } from "@/types"
import { getGoogleTokens, fetchCalendarContext, getNotionTokens } from "@/lib/plugins/data-fetcher"
import { parseEventFromCommand, createCalendarEvent } from "@/lib/plugins/calendar-plugin"
import { executePluginCommand } from "@/lib/plugins/plugin-executor"
import { getEnv } from "@/lib/server/env"
import { getGamificationData } from "@/lib/gamification/streak"

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
  requiresConfirmation?: boolean
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
  {
    name: "readCalendar",
    description: "Read the user's upcoming Google Calendar events. Use when the user asks 'what's on my calendar', 'am I free tomorrow', 'what do I have this week', or when planning needs calendar context.",
    parameters: {
      type: "object",
      properties: {
        hoursAhead: {
          type: "number",
          description: "how many hours ahead to look (default 48, max 168)"
        }
      }
    }
  },
  {
    name: "createCalendarEvent",
    description: "Create a Google Calendar event. Use when user asks to schedule something, book time, or set up a meeting. IMPORTANT: Only call this after showing the user the event details and receiving confirmation.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "event title (max 100 chars)" },
        dateTimeISO: { type: "string", description: "ISO 8601 start datetime" },
        durationMinutes: { type: "number", description: "event duration (default 60)" },
        description: { type: "string", description: "event description/notes (max 300 chars)" },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "email addresses of attendees"
        }
      },
      required: ["title", "dateTimeISO"]
    }
  },
  {
    name: "createNote",
    description: "Create a note in Notion or save to memory. Use when user asks to save something, write down an idea, or capture information. Requires Notion to be connected for Notion notes; otherwise saves to memory.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Note title (max 80 chars)" },
        content: { type: "string", description: "Note content (max 2000 chars)" },
        destination: { type: "string", enum: ["notion", "memory"], description: "Destination" }
      },
      required: ["title", "content"]
    }
  },
  {
    name: "draftEmail",
    description: "Draft an email for the user to review. Does NOT send — only creates a draft that the user must review and send manually. Use when user asks to write or compose an email.",
    parameters: {
      type: "object",
      properties: {
        to: { type: "string", description: "recipient name or email (max 200 chars)" },
        subject: { type: "string", description: "email subject (max 150 chars)" },
        body: { type: "string", description: "email body (max 3000 chars)" },
        tone: { type: "string", enum: ["formal", "friendly", "casual"], description: "tone (default friendly)" }
      },
      required: ["to", "subject", "body"]
    }
  },
  {
    name: "searchWeb",
    description: "Search the web for current information. Use when user asks about recent news, current facts, prices, weather, or anything that requires up-to-date information. Gemini has built-in Google Search — use this tool to explicitly trigger a targeted search.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "the search query (max 200 chars)" }
      },
      required: ["query"]
    }
  },
  {
    name: "logExpense",
    description: "Log an expense or spending record to the user's expense memory. Use when user says 'aaj 500 rupees spend kiye food pe', 'spent money on', 'bought X for Y rupees'.",
    parameters: {
      type: "object",
      properties: {
        amount: { type: "number", description: "amount spent" },
        currency: { type: "string", description: "currency (default INR)" },
        category: { type: "string", enum: ["food", "transport", "shopping", "entertainment", "health", "utilities", "other"], description: "expense category" },
        description: { type: "string", description: "what was spent on (max 100 chars)" },
        date: { type: "string", description: "YYYY-MM-DD, defaults to today" }
      },
      required: ["amount", "category", "description"]
    }
  },
  {
    name: "getWeekSummary",
    description: "Generate a summary of the user's week — their goals progress, streak status, mood trend, and key events. Use when user asks 'how was my week', 'summarize my week', 'week review karo'.",
    parameters: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "updateGoalProgress",
    description: "Mark progress on a user's goal from their LifeGraph. Use when user reports completing something related to a goal.",
    parameters: {
      type: "object",
      properties: {
        goalTitle: { type: "string", description: "which goal to update (max 80 chars)" },
        progressNote: { type: "string", description: "what was accomplished (max 200 chars)" }
      },
      required: ["goalTitle", "progressNote"]
    }
  }
]

// ─── Tool Executor ────────────────────────────────────────────────────────────

interface ToolContext {
  kv: KVStore | null
  vectorizeEnv: VectorizeEnv | null
  userId: string
  apiKey: string
}

const sanitizeStr = (s: unknown, maxLen: number) => {
  if (typeof s !== 'string') return ''
  return s.replace(/<[^>]*>?/gm, '').slice(0, maxLen)
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

      // ── New Tools ───────────────────────────────────────────────────────

      case "readCalendar": {
        if (!ctx.kv) return { toolName: name, status: "error", summary: "KV missing", output: "KV missing" }
        const tokens = await getGoogleTokens(ctx.kv, ctx.userId)
        if (!tokens) {
          return {
            toolName: name,
            status: "error",
            summary: "Google Calendar not connected",
            output: "Google Calendar is not connected. Ask me to help connect it."
          }
        }

        const env = getEnv()
        const output = await fetchCalendarContext(ctx.kv, ctx.userId, env.GOOGLE_CLIENT_ID || "", env.GOOGLE_CLIENT_SECRET || "", true)

        return {
          toolName: name,
          status: "done",
          summary: "Read calendar",
          output: output || "No upcoming events found."
        }
      }

      case "createCalendarEvent": {
        if (!ctx.kv) return { toolName: name, status: "error", summary: "KV missing", output: "KV missing" }
        const tokens = await getGoogleTokens(ctx.kv, ctx.userId)
        if (!tokens) {
          return {
            toolName: name,
            status: "error",
            summary: "Google Calendar not connected",
            output: "Google Calendar is not connected. Ask me to help connect it."
          }
        }

        const title = sanitizeStr(args.title, 100)
        let dateTimeISO = sanitizeStr(args.dateTimeISO, 100)
        const durationMinutes = (args.durationMinutes as number) || 60
        const description = sanitizeStr(args.description, 300)

        let startDateTime = dateTimeISO
        let endDateTime = ""
        try {
          const d = new Date(startDateTime)
          d.setMinutes(d.getMinutes() + durationMinutes)
          endDateTime = d.toISOString()
        } catch {}

        const res = await createCalendarEvent(tokens.accessToken, "primary", {
          title,
          startDateTime,
          endDateTime,
          description
        })

        if (!res.success) {
          return {
            toolName: name,
            status: "error",
            summary: "Failed to create event",
            output: res.output || "Error creating event."
          }
        }

        return {
          toolName: name,
          status: "done",
          summary: `Created event: ${title}`,
          output: res.url ? `Event created! [Link](${res.url})` : res.output,
          requiresConfirmation: true
        }
      }

      case "createNote": {
        if (!ctx.kv) return { toolName: name, status: "error", summary: "KV missing", output: "KV missing" }
        const destination = args.destination === "notion" ? "notion" : "memory"
        const title = sanitizeStr(args.title, 80)
        const content = sanitizeStr(args.content, 2000)

        if (destination === "notion") {
          const tokens = await getNotionTokens(ctx.kv, ctx.userId)
          if (tokens) {
            const res = await executePluginCommand(
              { pluginId: "notion", action: "create_page", parameters: { title, content }, rawUserMessage: content },
              { id: "notion", name: "Notion", status: "connected", connectedAt: Date.now(), credentials: { apiKey: tokens.accessToken }, settings: {} },
              ctx.apiKey
            )
            return {
              toolName: name,
              status: res.success ? "done" : "error",
              summary: res.success ? "Saved to Notion" : "Failed to save to Notion",
              output: res.output,
              requiresConfirmation: true
            }
          }
        }

        await addOrUpdateNode(ctx.kv, ctx.vectorizeEnv, ctx.userId, {
          userId: ctx.userId,
          title,
          detail: content,
          category: "skill",
          tags: ["note"],
          people: [],
          emotionalWeight: 0.2,
          confidence: 0.8,
          source: "explicit"
        }, ctx.apiKey)

        return {
          toolName: name,
          status: "done",
          summary: `Saved note: ${title}`,
          output: `Saved note to memory: ${title}`,
          requiresConfirmation: true
        }
      }

      case "draftEmail": {
        const to = sanitizeStr(args.to, 200)
        const subject = sanitizeStr(args.subject, 150)
        const body = sanitizeStr(args.body, 3000)

        return {
          toolName: name,
          status: "done",
          summary: `Drafted email to ${to}`,
          output: `To: ${to}\nSubject: ${subject}\n\n${body}`,
          requiresConfirmation: true
        }
      }

      case "searchWeb": {
        const query = sanitizeStr(args.query, 200)
        return {
          toolName: name,
          status: "done",
          summary: "Searching the web...",
          output: `SEARCH:${query}`
        }
      }

      case "logExpense": {
        if (!ctx.kv) return { toolName: name, status: "error", summary: "KV missing", output: "KV missing" }
        const amount = Number(args.amount)
        if (isNaN(amount)) {
          return { toolName: name, status: "error", summary: "Invalid amount", output: "Invalid amount" }
        }
        const currency = sanitizeStr(args.currency || "INR", 10)
        const category = sanitizeStr(args.category, 50) as "food" | "transport" | "shopping" | "entertainment" | "health" | "utilities" | "other" || "other"
        const description = sanitizeStr(args.description, 100)
        const date = sanitizeStr(args.date, 20) || new Date().toISOString().split('T')[0]

        await addOrUpdateNode(ctx.kv, ctx.vectorizeEnv, ctx.userId, {
          userId: ctx.userId,
          title: `Expense: ${description}`,
          detail: `Amount: ${amount} ${currency} on ${date}. Category: ${category}. Note: ${description}`,
          category: "event",
          tags: ["expense", category, currency.toLowerCase()],
          people: [],
          emotionalWeight: 0.2,
          confidence: 1.0,
          source: "explicit"
        }, ctx.apiKey)

        const yearMonth = date.substring(0, 7)
        const totalKey = `expense:total:${ctx.userId}:${yearMonth}`
        try {
          const raw = await ctx.kv.get(totalKey)
          let totals = raw ? JSON.parse(raw) : { monthlyTotal: 0, currency, byCategory: {} as Record<string, number> }
          totals.monthlyTotal += amount
          if (!totals.byCategory[category]) totals.byCategory[category] = 0
          totals.byCategory[category] += amount
          await ctx.kv.put(totalKey, JSON.stringify(totals), { expirationTtl: 86400 * 35 })
        } catch { }

        return {
          toolName: name,
          status: "done",
          summary: `Logged expense: ${amount} ${currency}`,
          output: `Logged expense of ${amount} ${currency} for ${description}`,
          requiresConfirmation: true
        }
      }

      case "getWeekSummary": {
        if (!ctx.kv) return { toolName: name, status: "error", summary: "KV missing", output: "KV missing" }

        const graph = await getLifeGraph(ctx.kv, ctx.userId)
        const gamification = await getGamificationData(ctx.kv, ctx.userId)

        const goals = graph.nodes.filter(n => n.category === "goal").length
        const totalInteractions = graph.totalInteractions
        const streak = gamification.loginStreak || 0

        return {
          toolName: name,
          status: "done",
          summary: "Generated week summary",
          output: `Week Summary:\n- Goals: ${goals}\n- Interactions: ${totalInteractions}\n- Streak: ${streak}`
        }
      }

      case "updateGoalProgress": {
        if (!ctx.kv) return { toolName: name, status: "error", summary: "KV missing", output: "KV missing" }
        const goalTitle = sanitizeStr(args.goalTitle, 80)
        const progressNote = sanitizeStr(args.progressNote, 200)

        const graph = await getLifeGraph(ctx.kv, ctx.userId)
        const goalNode = graph.nodes.find(n => n.category === "goal" && n.title.toLowerCase() === goalTitle.toLowerCase())

        if (goalNode) {
          const updatedDetail = `${goalNode.detail} [${new Date().toISOString().split('T')[0]}: ${progressNote}]`.slice(0, 500)
          await addOrUpdateNode(ctx.kv, ctx.vectorizeEnv, ctx.userId, {
            userId: ctx.userId,
            title: goalNode.title,
            detail: updatedDetail,
            category: "goal",
            tags: goalNode.tags,
            people: goalNode.people,
            emotionalWeight: goalNode.emotionalWeight,
            confidence: Math.min(1.0, goalNode.confidence + 0.05),
            source: "explicit"
          }, ctx.apiKey)
        } else {
          await addOrUpdateNode(ctx.kv, ctx.vectorizeEnv, ctx.userId, {
            userId: ctx.userId,
            title: goalTitle,
            detail: progressNote,
            category: "goal",
            tags: ["goal", "progress"],
            people: [],
            emotionalWeight: 0.5,
            confidence: 0.5,
            source: "explicit"
          }, ctx.apiKey)
        }

        return {
          toolName: name,
          status: "done",
          summary: `Updated progress for: ${goalTitle}`,
          output: `Progress updated: ${progressNote}`,
          requiresConfirmation: true
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
  readCalendar: "Checking your calendar",
  createCalendarEvent: "Creating calendar event",
  createNote: "Saving note",
  draftEmail: "Drafting email",
  searchWeb: "Searching the web",
  logExpense: "Logging expense",
  getWeekSummary: "Summarizing week",
  updateGoalProgress: "Updating goal progress"
}

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || `Running ${toolName}`
}
