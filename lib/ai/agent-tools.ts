/**
 * Agentic Tool Definitions & Executor
 *
 * Defines the function declarations that Gemini can autonomously call,
 * and the executor map that runs them against existing KV / plugin infra.
 */

import { searchLifeGraph, formatLifeGraphForPrompt, addOrUpdateNode, getLifeGraph } from "@/lib/memory/life-graph"
import type { VectorizeEnv } from "@/lib/memory/vectorize"
import type { KVStore } from "@/types"
import { getGoogleTokens, saveGoogleTokens, getNotionTokens } from "@/lib/plugins/data-fetcher"
import { createCalendarEvent as gcalCreateEvent } from "@/lib/plugins/calendar-plugin"
import { lookupContact as lookupContactFromStore, saveContact as saveContactToStore } from "@/lib/contacts/contact-store"
import { stripHtml } from "@/lib/validation/sanitizer"

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

// ─── Tool Context ─────────────────────────────────────────────────────────────

export interface ToolContext {
  kv: KVStore | null
  vectorizeEnv: VectorizeEnv | null
  userId: string
  apiKey: string
  googleClientId?: string      // for token refresh in readCalendar
  googleClientSecret?: string  // for token refresh in readCalendar
  resendApiKey?: string        // for sendEmail tool
}

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_EXPENSE_CATEGORIES = [
  "food", "transport", "shopping", "entertainment", "health", "utilities", "other",
] as const

// ─── Shared: Google Token Refresh Helper (BUG-011 fix) ────────────────────────
// Extracted from 4 duplicate inline blocks across readCalendar, updateCalendarEvent,
// deleteCalendarEvent, and findFreeSlot to a single reusable function.

interface GoogleTokenSet {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

async function refreshGoogleTokenIfNeeded(
  tokens: GoogleTokenSet,
  ctx: ToolContext,
): Promise<GoogleTokenSet> {
  if (!ctx.kv) return tokens
  if (Date.now() < tokens.expiresAt - 60_000) return tokens
  if (!ctx.googleClientId || !ctx.googleClientSecret) return tokens

  try {
    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refreshToken,
        client_id: ctx.googleClientId,
        client_secret: ctx.googleClientSecret,
      }),
    })
    if (refreshRes.ok) {
      const refreshData = await refreshRes.json() as { access_token: string; expires_in: number }
      const updated = { ...tokens, accessToken: refreshData.access_token, expiresAt: Date.now() + refreshData.expires_in * 1000 }
      await saveGoogleTokens(ctx.kv, ctx.userId, updated)
      return updated
    }
  } catch { /* use existing token */ }
  return tokens
}

// ─── Gemini Function Declarations ─────────────────────────────────────────────
// These are injected into the Gemini request so the model can autonomously
// decide to call them during a conversation.

export const AGENT_FUNCTION_DECLARATIONS = [
  // ── Existing tools — DO NOT MODIFY ──────────────────────────────────────
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

  // ── New tools ────────────────────────────────────────────────────────────

  {
    name: "readCalendar",
    description:
      "Read the user's upcoming Google Calendar events. Use when the user asks 'what's on my calendar', 'am I free tomorrow', 'what do I have this week', or when planning needs calendar context.",
    parameters: {
      type: "object",
      properties: {
        hoursAhead: {
          type: "number",
          description: "How many hours ahead to look (default 48, max 168).",
        },
      },
    },
  },

  {
    name: "createCalendarEvent",
    description:
      "Create a Google Calendar event. Use when user asks to schedule something, book time, or set up a meeting. IMPORTANT: Only call this after showing the user the event details and receiving confirmation.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Event title (max 100 chars).",
        },
        dateTimeISO: {
          type: "string",
          description: "ISO 8601 start datetime, e.g. 2026-04-16T15:00:00+05:30.",
        },
        durationMinutes: {
          type: "number",
          description: "Event duration in minutes (default 60).",
        },
        description: {
          type: "string",
          description: "Event description or notes (max 300 chars).",
        },
        attendees: {
          type: "array",
          items: { type: "string" },
          description: "Email addresses of attendees.",
        },
      },
      required: ["title", "dateTimeISO"],
    },
  },

  {
    name: "createNote",
    description:
      "Create a note in Notion or save to memory. Use when user asks to save something, write down an idea, or capture information. Requires Notion to be connected for Notion notes; otherwise saves to memory.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Note title (max 80 chars).",
        },
        content: {
          type: "string",
          description: "Note content (max 2000 chars).",
        },
        destination: {
          type: "string",
          enum: ["notion", "memory"],
          description: "Where to save: 'notion' or 'memory' (default: notion).",
        },
      },
      required: ["title", "content"],
    },
  },

  {
    name: "draftEmail",
    description:
      "Draft an email for the user to review. Does NOT send — only creates a draft that the user must review and send manually. Use when user asks to write or compose an email.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient name or email (max 200 chars).",
        },
        subject: {
          type: "string",
          description: "Email subject line (max 150 chars).",
        },
        body: {
          type: "string",
          description: "Email body text (max 3000 chars).",
        },
        tone: {
          type: "string",
          enum: ["formal", "friendly", "casual"],
          description: "Tone of the email (default: friendly).",
        },
      },
      required: ["to", "subject", "body"],
    },
  },

  {
    name: "searchWeb",
    description:
      "Search the web for current information. Use when user asks about recent news, current facts, prices, weather, or anything that requires up-to-date information. Supports platform-specific search on Twitter/X, Reddit, YouTube, Instagram, TikTok, and news sites.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query (max 200 chars).",
        },
        platform: {
          type: "string",
          enum: ["general", "twitter", "reddit", "youtube", "instagram", "tiktok", "news"],
          description: "Platform to search on. Use 'twitter' for tweets/X posts, 'reddit' for Reddit discussions, 'youtube' for videos, 'news' for news articles. Default: general.",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "logExpense",
    description:
      "Log an expense or spending record to the user's expense memory. Use when user says 'aaj 500 rupees spend kiye food pe', 'spent money on', 'bought X for Y rupees'.",
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "number",
          description: "Amount spent (must be positive).",
        },
        currency: {
          type: "string",
          description: "Currency code (default: INR).",
        },
        category: {
          type: "string",
          enum: ["food", "transport", "shopping", "entertainment", "health", "utilities", "other"],
          description: "Expense category.",
        },
        description: {
          type: "string",
          description: "What was spent on (max 100 chars).",
        },
        date: {
          type: "string",
          description: "Date in YYYY-MM-DD format (defaults to today).",
        },
      },
      required: ["amount", "category", "description"],
    },
  },

  {
    name: "getWeekSummary",
    description:
      "Generate a summary of the user's week — their goals progress, streak status, and key events. Use when user asks 'how was my week', 'summarize my week', 'week review karo'.",
    parameters: {
      type: "object",
      properties: {},
    },
  },

  {
    name: "updateGoalProgress",
    description:
      "Mark progress on a user's goal from their LifeGraph. Use when user reports completing something related to a goal.",
    parameters: {
      type: "object",
      properties: {
        goalTitle: {
          type: "string",
          description: "Which goal to update (max 80 chars).",
        },
        progressNote: {
          type: "string",
          description: "What was accomplished (max 200 chars).",
        },
      },
      required: ["goalTitle", "progressNote"],
    },
  },

  // ── EDITH Mode Tools ────────────────────────────────────────────────────

  {
    name: "sendEmail",
    description:
      "Send an email immediately directly to the recipient. If only a name is given, use lookupContact first to resolve the email address before sending.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address (must be a valid email).",
        },
        subject: {
          type: "string",
          description: "Email subject line (max 150 chars).",
        },
        body: {
          type: "string",
          description: "Email body text (max 3000 chars).",
        },
        replyTo: {
          type: "string",
          description: "Reply-to email address (optional — user's email if known).",
        },
      },
      required: ["to", "subject", "body"],
    },
  },

  {
    name: "confirmSendEmail",
    description:
      "Actually send the email after the user has confirmed the draft. Only call this AFTER the user explicitly confirms (says 'send it', 'yes', 'go ahead'). Pass the same to/subject/body from the draft.",
    parameters: {
      type: "object",
      properties: {
        to: {
          type: "string",
          description: "Recipient email address (must be a valid email).",
        },
        subject: {
          type: "string",
          description: "Email subject line (max 150 chars).",
        },
        body: {
          type: "string",
          description: "Email body text (max 3000 chars).",
        },
        replyTo: {
          type: "string",
          description: "Reply-to email address (optional).",
        },
      },
      required: ["to", "subject", "body"],
    },
  },

  {
    name: "lookupContact",
    description:
      "Look up a contact by name to find their email address, phone number, or other details. Use this before sendEmail when the user gives a name instead of an email address.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The name to search for (first name, last name, or nickname).",
        },
      },
      required: ["name"],
    },
  },

  {
    name: "saveContact",
    description:
      "Save a new contact or update an existing one. Use when user shares someone's contact info like email or phone number.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Contact's name.",
        },
        email: {
          type: "string",
          description: "Contact's email address.",
        },
        phone: {
          type: "string",
          description: "Contact's phone number (optional).",
        },
        relation: {
          type: "string",
          description: "Relationship to user — e.g. 'friend', 'colleague', 'boss' (optional).",
        },
      },
      required: ["name", "email"],
    },
  },

  {
    name: "searchNews",
    description:
      "Search for the latest news headlines and articles. Use when user asks about current news, breaking news, latest headlines, or 'kya chal raha hai duniya mein'.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Topic to search news for. Leave empty for top headlines.",
        },
        category: {
          type: "string",
          enum: ["general", "business", "technology", "science", "health", "sports", "entertainment"],
          description: "News category (default: general).",
        },
      },
    },
  },

  {
    name: "searchYouTube",
    description:
      "Search YouTube for videos. Use when user asks to find videos, tutorials, or YouTube content about a topic.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query for YouTube videos.",
        },
        maxResults: {
          type: "number",
          description: "Number of results to return (default: 5, max: 10).",
        },
      },
      required: ["query"],
    },
  },

  {
    name: "updateCalendarEvent",
    description:
      "Update an existing Google Calendar event — reschedule, change title, or modify details. Use when user wants to change an existing event.",
    parameters: {
      type: "object",
      properties: {
        searchQuery: {
          type: "string",
          description: "Search term to find the event to update (e.g. event title).",
        },
        newTitle: {
          type: "string",
          description: "New title for the event (optional).",
        },
        newDateTimeISO: {
          type: "string",
          description: "New start time in ISO 8601 format (optional).",
        },
        newDurationMinutes: {
          type: "number",
          description: "New duration in minutes (optional).",
        },
      },
      required: ["searchQuery"],
    },
  },

  {
    name: "deleteCalendarEvent",
    description:
      "Delete/cancel a Google Calendar event. Use when user wants to cancel or remove an event.",
    parameters: {
      type: "object",
      properties: {
        searchQuery: {
          type: "string",
          description: "Search term to find the event to delete (e.g. event title).",
        },
      },
      required: ["searchQuery"],
    },
  },

  {
    name: "findFreeSlot",
    description:
      "Find free time slots in the user's Google Calendar. Use when user asks 'when am I free', 'find me a slot', or wants to schedule something and needs to know available times.",
    parameters: {
      type: "object",
      properties: {
        durationMinutes: {
          type: "number",
          description: "How long the slot needs to be in minutes (default: 60).",
        },
        daysAhead: {
          type: "number",
          description: "How many days ahead to search (default: 3, max: 7).",
        },
        preferredTimeRange: {
          type: "string",
          enum: ["morning", "afternoon", "evening", "any"],
          description: "Preferred time of day (default: any).",
        },
      },
    },
  },
]

// ─── Tool Executor ────────────────────────────────────────────────────────────

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
        // SEC-003 fix: strip HTML from args before KV storage so injected
        // markup can't re-enter the AI context via searchMemory recall.
        const task = stripHtml((args.task as string) || "Untitled reminder")
        const time = stripHtml((args.time as string) || "unspecified")

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
        // SEC-003 fix: strip HTML from args before KV storage.
        const title = stripHtml((args.title as string) || "Quick Note")
        const content = stripHtml((args.content as string) || "")

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

      // ── Read Calendar ───────────────────────────────────────────────────
      case "readCalendar": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
        }

        let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
        if (!tokens) {
          return {
            toolName: name,
            status: "error",
            summary: "Calendar not connected",
            output: "Google Calendar is not connected. Please connect it from Settings.",
          }
        }

        tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

        const hoursAhead = Math.min(Number(args.hoursAhead) || 48, 168)
        const timeMin = new Date().toISOString()
        const timeMax = new Date(Date.now() + hoursAhead * 3_600_000).toISOString()

        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
            timeMin,
            timeMax,
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "15",
          })}`,
          { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
        )

        if (!calRes.ok) {
          if (calRes.status === 401) {
            return { toolName: name, status: "error", summary: "Calendar token expired", output: "Your Google Calendar session has expired. Please reconnect." }
          }
          return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not read your calendar events." }
        }

        const calData = await calRes.json() as { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string } }> }
        const items = calData.items || []

        if (items.length === 0) {
          return { toolName: name, status: "done", summary: "No upcoming events", output: `No events found in the next ${hoursAhead} hours.` }
        }

        const lines = items.map((item) => {
          const dt = item.start?.dateTime || item.start?.date || ""
          const formatted = dt
            ? new Date(dt).toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
            : "Unknown time"
          return `- ${formatted}: ${item.summary || "Untitled"}`
        })

        return {
          toolName: name,
          status: "done",
          summary: `Found ${items.length} upcoming events`,
          output: `Your next ${hoursAhead}h of events:\n${lines.join("\n")}`,
        }
      }

      // ── Create Calendar Event ────────────────────────────────────────────
      case "createCalendarEvent": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
        }

        const tokens = await getGoogleTokens(ctx.kv, ctx.userId)
        if (!tokens) {
          return {
            toolName: name,
            status: "error",
            summary: "Calendar not connected",
            output: "Google Calendar is not connected. Please connect it from Settings.",
          }
        }

        const rawTitle = stripHtml(String(args.title || "")).slice(0, 100) || "New Event"
        const rawDesc = stripHtml(String(args.description || "")).slice(0, 300)
        const dateTimeISO = String(args.dateTimeISO || "")
        const durationMs = (Math.abs(Number(args.durationMinutes)) || 60) * 60_000

        let startDateTime: string
        try {
          startDateTime = new Date(dateTimeISO).toISOString()
        } catch {
          return { toolName: name, status: "error", summary: "Invalid date", output: "Could not parse the event date/time. Please provide a valid ISO date." }
        }

        const endDateTime = new Date(new Date(startDateTime).getTime() + durationMs).toISOString()

        const result = await gcalCreateEvent(tokens.accessToken, "primary", {
          title: rawTitle,
          startDateTime,
          endDateTime,
          description: rawDesc,
        })

        if (!result.success) {
          return { toolName: name, status: "error", summary: "Event creation failed", output: result.error || result.output || "Could not create the calendar event." }
        }

        return {
          toolName: name,
          status: "done",
          summary: `Event "${rawTitle}" created`,
          output: result.url ? `Event created! View it here: ${result.url}` : `Event "${rawTitle}" has been added to your calendar.`,
        }
      }

      // ── Create Note ─────────────────────────────────────────────────────
      case "createNote": {
        const sanitizedTitle = stripHtml(String(args.title || "")).slice(0, 80) || "New Note"
        const sanitizedContent = stripHtml(String(args.content || "")).slice(0, 2000)
        const destination = args.destination === "notion" ? "notion" : "memory"
        let savedTo = "memory"

        if (destination === "notion" && ctx.kv) {
          const notionTokens = await getNotionTokens(ctx.kv, ctx.userId)
          if (notionTokens) {
            try {
              const notionRes = await fetch("https://api.notion.com/v1/pages", {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${notionTokens.accessToken}`,
                  "Content-Type": "application/json",
                  "Notion-Version": "2022-06-28",
                },
                body: JSON.stringify({
                  parent: { workspace: true },
                  properties: {
                    title: { title: [{ type: "text", text: { content: sanitizedTitle } }] },
                  },
                  children: [
                    {
                      object: "block",
                      type: "paragraph",
                      paragraph: { rich_text: [{ type: "text", text: { content: sanitizedContent } }] },
                    },
                  ],
                }),
              })
              if (notionRes.ok) {
                savedTo = `Notion (${notionTokens.workspaceName})`
              }
            } catch { /* fall through to memory */ }
          }
        }

        if (savedTo === "memory") {
          if (!ctx.kv) {
            return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot save note — storage is not connected." }
          }
          await addOrUpdateNode(
            ctx.kv,
            ctx.vectorizeEnv,
            ctx.userId,
            {
              userId: ctx.userId,
              category: "skill",
              title: sanitizedTitle,
              detail: sanitizedContent,
              source: "explicit",
              tags: [],
              people: [],
              emotionalWeight: 0.3,
              confidence: 0.8,
            },
            ctx.apiKey,
          )
        }

        return {
          toolName: name,
          status: "done",
          summary: `Note saved to ${savedTo}`,
          output: `Note "${sanitizedTitle}" saved to ${savedTo}.`,
        }
      }

      // ── Draft Email ──────────────────────────────────────────────────────
      case "draftEmail": {
        const to = stripHtml(String(args.to || "")).slice(0, 200) || "Recipient"
        const subject = stripHtml(String(args.subject || "")).slice(0, 150) || "No Subject"
        const body = stripHtml(String(args.body || "")).slice(0, 3000)

        const draft = `To: ${to}\nSubject: ${subject}\n\n${body}`

        return {
          toolName: name,
          status: "done",
          summary: `Draft ready: "${subject}"`,
          output: draft,
        }
      }

      // ── Search Web ───────────────────────────────────────────────────────
      case "searchWeb": {
        const query = String(args.query || "").slice(0, 200)
        if (!query) {
          return { toolName: name, status: "error", summary: "No query", output: "Please provide a search query." }
        }

        // Platform-specific search modifiers
        const platform = String(args.platform || "general")
        const PLATFORM_SUFFIXES: Record<string, string> = {
          twitter: " site:twitter.com OR site:x.com",
          reddit: " site:reddit.com",
          youtube: " site:youtube.com",
          instagram: " site:instagram.com",
          tiktok: " site:tiktok.com",
          news: " (news OR breaking OR latest OR headlines)",
        }
        const platformSuffix = PLATFORM_SUFFIXES[platform] || ""
        const enhancedQuery = `${query}${platformSuffix}`

        try {
          // Use Gemini with Google Search grounding to get real web results
          const { geminiGenerate } = await import("./vertex-client")
          const searchBody = {
            contents: [{ role: "user", parts: [{ text: `Search the web and give me a concise summary about: ${enhancedQuery}` }] }],
            tools: [{ google_search: {} }],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 1024,
            },
          }

          const searchRes = await geminiGenerate("gemini-2.5-flash", searchBody as Record<string, unknown>)

          if (!searchRes.ok) {
            return {
              toolName: name,
              status: "done",
              summary: `Searched for "${query}"`,
              output: `I searched for "${query}" but couldn't get results right now. Try asking in the chat for a more detailed answer.`,
            }
          }

          const searchData = await searchRes.json() as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> }
              groundingMetadata?: {
                searchEntryPoint?: { renderedContent?: string }
                groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>
              }
            }>
          }

          const parts = searchData?.candidates?.[0]?.content?.parts ?? []
          const responseText = parts.map(p => p.text ?? "").join("").trim()
          const output = responseText || `No results found for "${query}".`

          return {
            toolName: name,
            status: "done",
            summary: `Found results for "${query}"`,
            output,
          }
        } catch (err) {
          console.error("[searchWeb] Error:", err)
          return {
            toolName: name,
            status: "done",
            summary: `Searched for "${query}"`,
            output: `Search for "${query}" encountered an error. Try asking in the chat instead.`,
          }
        }
      }

      // ── Log Expense ──────────────────────────────────────────────────────
      case "logExpense": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot log expense — storage is not connected." }
        }

        const amount = Math.abs(Number(args.amount) || 0)
        if (amount === 0) {
          return { toolName: name, status: "error", summary: "Invalid amount", output: "Please provide a valid expense amount." }
        }
        const currency = String(args.currency || "INR").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5) || "INR"
        const rawCategory = String(args.category || "other")
        const category = (VALID_EXPENSE_CATEGORIES as readonly string[]).includes(rawCategory) ? rawCategory : "other"
        const description = stripHtml(String(args.description || "")).slice(0, 100) || "Expense"
        const today = new Date().toISOString().split("T")[0]
        const date = /^\d{4}-\d{2}-\d{2}$/.test(String(args.date || "")) ? String(args.date) : today

        // Save LifeNode
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
          ctx.apiKey,
        )

        // Update monthly KV total
        const yearMonth = date.slice(0, 7)
        const totalKey = `expense:total:${ctx.userId}:${yearMonth}`
        let totals: { total: number; byCategory: Record<string, number> } = { total: 0, byCategory: {} }
        try {
          const existing = await ctx.kv.get(totalKey)
          if (existing) totals = JSON.parse(existing)
        } catch {}
        totals.total = (totals.total || 0) + amount
        totals.byCategory[category] = (totals.byCategory[category] || 0) + amount
        await ctx.kv.put(totalKey, JSON.stringify(totals), { expirationTtl: 35 * 86_400 })

        return {
          toolName: name,
          status: "done",
          summary: `Logged ${currency} ${amount} on ${description}`,
          output: `Expense logged: ${amount} ${currency} spent on ${description} (${category}) on ${date}.`,
        }
      }

      // ── Get Week Summary ─────────────────────────────────────────────────
      case "getWeekSummary": {
        if (!ctx.kv) {
          return { toolName: name, status: "done", summary: "Week summary", output: "No data available yet — start using Missi to build your week summary!" }
        }

        const [graph, gamifRaw] = await Promise.all([
          getLifeGraph(ctx.kv, ctx.userId),
          ctx.kv.get(`gamification:${ctx.userId}`),
        ])

        const gamif = gamifRaw ? (JSON.parse(gamifRaw) as {
          totalXP?: number
          habits?: Array<{ title: string; currentStreak: number; longestStreak: number; totalCheckIns: number }>
        }) : null

        const goalNodes = graph.nodes.filter(n => n.category === "goal")
        const habitNodes = graph.nodes.filter(n => n.category === "habit")
        const totalXP = gamif?.totalXP ?? 0
        const topHabit = gamif?.habits?.reduce(
          (best: { title: string; currentStreak: number } | null, h) =>
            h.currentStreak > (best?.currentStreak ?? 0) ? h : best,
          null,
        )

        const parts: string[] = ["📅 Your Week Summary\n"]
        parts.push(`✨ Total XP earned: ${totalXP}`)
        if (goalNodes.length > 0) {
          parts.push(`🎯 Active goals: ${goalNodes.length}`)
          parts.push(goalNodes.slice(0, 3).map(g => `  • ${g.title}`).join("\n"))
        } else {
          parts.push("🎯 No goals set yet")
        }
        if (habitNodes.length > 0) {
          parts.push(`💪 Habits tracked: ${habitNodes.length}`)
        }
        if (topHabit) {
          parts.push(`🔥 Best streak: ${topHabit.title} — ${topHabit.currentStreak} days`)
        }
        parts.push(`🧠 Total memories: ${graph.nodes.length}`)

        return {
          toolName: name,
          status: "done",
          summary: "Week summary ready",
          output: parts.join("\n"),
        }
      }

      // ── Update Goal Progress ─────────────────────────────────────────────
      case "updateGoalProgress": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot update goal — storage is not connected." }
        }

        const goalTitle = stripHtml(String(args.goalTitle || "")).slice(0, 80)
        const progressNote = stripHtml(String(args.progressNote || "")).slice(0, 200)

        if (!goalTitle) {
          return { toolName: name, status: "error", summary: "No goal title", output: "Please specify which goal to update." }
        }

        const results = await searchLifeGraph(
          ctx.kv,
          ctx.vectorizeEnv,
          ctx.userId,
          goalTitle,
          ctx.apiKey,
          { topK: 3, category: "goal" },
        )

        if (results.length > 0) {
          const node = results[0].node
          const timestamp = new Date().toISOString()
          const updatedDetail = `${node.detail}\n[${timestamp}] ${progressNote}`.slice(0, 2500)
          await addOrUpdateNode(
            ctx.kv,
            ctx.vectorizeEnv,
            ctx.userId,
            {
              userId: ctx.userId,
              category: "goal",
              title: node.title,
              detail: updatedDetail,
              tags: node.tags,
              people: node.people,
              emotionalWeight: node.emotionalWeight,
              confidence: Math.min((node.confidence || 0) + 0.05, 1.0),
              source: "explicit",
            },
            ctx.apiKey,
          )
          return {
            toolName: name,
            status: "done",
            summary: `Goal "${node.title}" updated`,
            output: `Progress noted on "${node.title}": ${progressNote}`,
          }
        }

        // Goal not found — create new one
        await addOrUpdateNode(
          ctx.kv,
          ctx.vectorizeEnv,
          ctx.userId,
          {
            userId: ctx.userId,
            category: "goal",
            title: goalTitle,
            detail: `[${new Date().toISOString()}] ${progressNote}`,
            tags: ["goal"],
            people: [],
            emotionalWeight: 0.6,
            confidence: 0.7,
            source: "explicit",
          },
          ctx.apiKey,
        )

        return {
          toolName: name,
          status: "done",
          summary: `New goal "${goalTitle}" created`,
          output: `Couldn't find an existing goal matching "${goalTitle}", so I created it with your progress note.`,
        }
      }

      // ── Send Email — Actually sends without confirmation ──────
      case "sendEmail": {
        const to = stripHtml(String(args.to || "")).slice(0, 200)
        const subject = stripHtml(String(args.subject || "")).slice(0, 150) || "No Subject"
        const body = stripHtml(String(args.body || "")).slice(0, 3000)
        const replyTo = args.replyTo ? stripHtml(String(args.replyTo)).slice(0, 200) : undefined

        if (!to || !to.includes("@")) {
          return { toolName: name, status: "error", summary: "Invalid email", output: "Please provide a valid recipient email address." }
        }

        const resendKey = ctx.resendApiKey
        if (!resendKey) {
          return { toolName: name, status: "error", summary: "Email not configured", output: "Email sending is not configured. Please add RESEND_API_KEY to the environment." }
        }

        try {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Missi <missi@missi.space>",
              to: [to],
              subject,
              text: body,
              ...(replyTo ? { reply_to: replyTo } : {}),
            }),
          })

          if (!emailRes.ok) {
            const errData = await emailRes.text().catch(() => "")
            return { toolName: name, status: "error", summary: "Email send failed", output: `Failed to send email: ${errData.slice(0, 200)}` }
          }

          return {
            toolName: name,
            status: "done",
            summary: `Email sent to ${to}`,
            output: `Email sent successfully to ${to} with subject "${subject}".`,
          }
        } catch (err) {
          return { toolName: name, status: "error", summary: "Email failed", output: `Error sending email: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      // ── Confirm Send Email — Actually sends after user confirmation ──────
      case "confirmSendEmail": {
        const to = stripHtml(String(args.to || "")).slice(0, 200)
        const subject = stripHtml(String(args.subject || "")).slice(0, 150) || "No Subject"
        const body = stripHtml(String(args.body || "")).slice(0, 3000)
        const replyTo = args.replyTo ? stripHtml(String(args.replyTo)).slice(0, 200) : undefined

        if (!to || !to.includes("@")) {
          return { toolName: name, status: "error", summary: "Invalid email", output: "Please provide a valid recipient email address." }
        }

        const resendKey = ctx.resendApiKey
        if (!resendKey) {
          return { toolName: name, status: "error", summary: "Email not configured", output: "Email sending is not configured. Please add RESEND_API_KEY to the environment." }
        }

        try {
          const emailRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Missi <missi@missi.space>",
              to: [to],
              subject,
              text: body,
              ...(replyTo ? { reply_to: replyTo } : {}),
            }),
          })

          if (!emailRes.ok) {
            const errData = await emailRes.text().catch(() => "")
            return { toolName: name, status: "error", summary: "Email send failed", output: `Failed to send email: ${errData.slice(0, 200)}` }
          }

          return {
            toolName: name,
            status: "done",
            summary: `Email sent to ${to}`,
            output: `Email sent successfully to ${to} with subject "${subject}".`,
          }
        } catch (err) {
          return { toolName: name, status: "error", summary: "Email failed", output: `Error sending email: ${err instanceof Error ? err.message : String(err)}` }
        }
      }

      // ── Lookup Contact ──────────────────────────────────────────────────
      case "lookupContact": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot look up contacts — storage is not connected." }
        }

        const contactName = String(args.name || "").trim()
        if (!contactName) {
          return { toolName: name, status: "error", summary: "No name", output: "Please provide a name to look up." }
        }

        const contact = await lookupContactFromStore(ctx.kv, ctx.userId, contactName)
        if (!contact) {
          return {
            toolName: name,
            status: "done",
            summary: `No contact found for "${contactName}"`,
            output: `No contact found matching "${contactName}". Ask the user for their email address and use saveContact to save it.`,
          }
        }

        return {
          toolName: name,
          status: "done",
          summary: `Found: ${contact.name} (${contact.email})`,
          output: `Contact found — Name: ${contact.name}, Email: ${contact.email}${contact.phone ? `, Phone: ${contact.phone}` : ""}${contact.relation ? `, Relation: ${contact.relation}` : ""}`,
        }
      }

      // ── Save Contact ────────────────────────────────────────────────────
      case "saveContact": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Cannot save contact — storage is not connected." }
        }

        const cName = stripHtml(String(args.name || "")).slice(0, 100)
        const cEmail = stripHtml(String(args.email || "")).slice(0, 200)
        if (!cName || !cEmail) {
          return { toolName: name, status: "error", summary: "Missing fields", output: "Both name and email are required to save a contact." }
        }

        const saved = await saveContactToStore(ctx.kv, ctx.userId, {
          name: cName,
          email: cEmail,
          phone: args.phone ? String(args.phone).slice(0, 20) : undefined,
          relation: args.relation ? String(args.relation).slice(0, 50) : undefined,
        })

        return {
          toolName: name,
          status: "done",
          summary: `Contact saved: ${saved.name}`,
          output: `Contact saved — ${saved.name} (${saved.email})`,
        }
      }

      // ── Search News ─────────────────────────────────────────────────────
      case "searchNews": {
        const query = String(args.query || "").slice(0, 200)
        const category = String(args.category || "general")

        try {
          // Use Gemini with Google Search grounding for news
          const { geminiGenerate } = await import("./vertex-client")
          const newsPrompt = query
            ? `Search for the latest news about: ${query}. Give me a concise summary of the top 5 most recent and relevant news articles with dates and sources.`
            : `What are today's top ${category} news headlines? Give me a concise summary of the top 5 most important stories with dates and sources.`

          const searchBody = {
            contents: [{ role: "user", parts: [{ text: newsPrompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }

          const searchRes = await geminiGenerate("gemini-2.5-flash", searchBody as Record<string, unknown>)
          if (!searchRes.ok) {
            return { toolName: name, status: "done", summary: "News search failed", output: "Could not fetch news right now. Try again later." }
          }

          const searchData = await searchRes.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          }

          const parts = searchData?.candidates?.[0]?.content?.parts ?? []
          const responseText = parts.map(p => p.text ?? "").join("").trim()

          return {
            toolName: name,
            status: "done",
            summary: query ? `News about "${query}"` : `Top ${category} headlines`,
            output: responseText || "No news results found.",
          }
        } catch (err) {
          console.error("[searchNews] Error:", err)
          return { toolName: name, status: "error", summary: "News search failed", output: "Error searching for news." }
        }
      }

      // ── Search YouTube ──────────────────────────────────────────────────
      case "searchYouTube": {
        const query = String(args.query || "").slice(0, 200)
        if (!query) {
          return { toolName: name, status: "error", summary: "No query", output: "Please provide a search query for YouTube." }
        }

        try {
          // Use Gemini with Google Search for YouTube results
          const { geminiGenerate } = await import("./vertex-client")
          const searchBody = {
            contents: [{
              role: "user",
              parts: [{ text: `Search YouTube for videos about: ${query}. List the top ${Math.min(Number(args.maxResults) || 5, 10)} results with video title, channel name, and a brief description of what each video covers.` }],
            }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }

          const searchRes = await geminiGenerate("gemini-2.5-flash", searchBody as Record<string, unknown>)
          if (!searchRes.ok) {
            return { toolName: name, status: "done", summary: "YouTube search failed", output: "Could not search YouTube right now." }
          }

          const searchData = await searchRes.json() as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
          }

          const parts = searchData?.candidates?.[0]?.content?.parts ?? []
          const responseText = parts.map(p => p.text ?? "").join("").trim()

          return {
            toolName: name,
            status: "done",
            summary: `YouTube results for "${query}"`,
            output: responseText || `No YouTube videos found for "${query}".`,
          }
        } catch (err) {
          console.error("[searchYouTube] Error:", err)
          return { toolName: name, status: "error", summary: "YouTube search failed", output: "Error searching YouTube." }
        }
      }

      // ── Update Calendar Event ───────────────────────────────────────────
      case "updateCalendarEvent": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
        }

        let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
        if (!tokens) {
          return { toolName: name, status: "error", summary: "Calendar not connected", output: "Google Calendar is not connected." }
        }

        tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

        const searchQuery = String(args.searchQuery || "").toLowerCase()
        // Find the event by searching upcoming events
        const timeMin = new Date().toISOString()
        const timeMax = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()

        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
            timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "20", q: searchQuery,
          })}`,
          { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
        )

        if (!calRes.ok) {
          return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not search calendar events." }
        }

        const calData = await calRes.json() as { items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }> }
        const items = calData.items || []
        if (items.length === 0) {
          return { toolName: name, status: "error", summary: "Event not found", output: `No event matching "${searchQuery}" found in the next 7 days.` }
        }

        const event = items[0]
        const patchBody: Record<string, unknown> = {}
        if (args.newTitle) patchBody.summary = stripHtml(String(args.newTitle)).slice(0, 100)
        if (args.newDateTimeISO) {
          const newStart = new Date(String(args.newDateTimeISO)).toISOString()
          const durationMs = (Math.abs(Number(args.newDurationMinutes)) || 60) * 60_000
          patchBody.start = { dateTime: newStart }
          patchBody.end = { dateTime: new Date(new Date(newStart).getTime() + durationMs).toISOString() }
        }

        if (Object.keys(patchBody).length === 0) {
          return { toolName: name, status: "error", summary: "No changes", output: "No changes specified. Provide a new title, date, or duration." }
        }

        const patchRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${event.id}`,
          {
            method: "PATCH",
            headers: { Authorization: `Bearer ${tokens.accessToken}`, "Content-Type": "application/json" },
            body: JSON.stringify(patchBody),
          },
        )

        if (!patchRes.ok) {
          return { toolName: name, status: "error", summary: "Update failed", output: "Could not update the calendar event." }
        }

        return {
          toolName: name,
          status: "done",
          summary: `Updated: "${event.summary || "Event"}"`,
          output: `Event "${event.summary || "Event"}" has been updated.`,
        }
      }

      // ── Delete Calendar Event ───────────────────────────────────────────
      case "deleteCalendarEvent": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
        }

        let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
        if (!tokens) {
          return { toolName: name, status: "error", summary: "Calendar not connected", output: "Google Calendar is not connected." }
        }

        tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

        const delSearchQuery = String(args.searchQuery || "").toLowerCase()
        const timeMin = new Date().toISOString()
        const timeMax = new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()

        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
            timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "10", q: delSearchQuery,
          })}`,
          { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
        )

        if (!calRes.ok) {
          return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not search calendar events." }
        }

        const delCalData = await calRes.json() as { items?: Array<{ id: string; summary?: string; start?: { dateTime?: string; date?: string } }> }
        const delItems = delCalData.items || []
        if (delItems.length === 0) {
          return { toolName: name, status: "error", summary: "Event not found", output: `No event matching "${delSearchQuery}" found.` }
        }

        // BUG-006 fix: Disambiguate when multiple events match before deleting
        if (delItems.length > 1) {
          const listing = delItems.map((ev, i) => {
            const when = ev.start?.dateTime
              ? new Date(ev.start.dateTime).toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
              : ev.start?.date || "unknown date"
            return `${i + 1}. "${ev.summary || "Untitled"}" on ${when}`
          }).join("\n")
          return {
            toolName: name,
            status: "done",
            summary: `Found ${delItems.length} matching events`,
            output: `I found ${delItems.length} events matching "${delSearchQuery}". Which one should I delete?\n\n${listing}\n\nPlease specify the event name more precisely.`,
          }
        }

        const delEvent = delItems[0]
        const delRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events/${delEvent.id}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          },
        )

        if (!delRes.ok && delRes.status !== 204) {
          return { toolName: name, status: "error", summary: "Delete failed", output: "Could not delete the calendar event." }
        }

        return {
          toolName: name,
          status: "done",
          summary: `Deleted: "${delEvent.summary || "Event"}"`,
          output: `Event "${delEvent.summary || "Event"}" has been deleted from your calendar.`,
        }
      }

      // ── Find Free Slot ──────────────────────────────────────────────────
      case "findFreeSlot": {
        if (!ctx.kv) {
          return { toolName: name, status: "error", summary: "Storage unavailable", output: "Storage is not connected." }
        }

        let tokens = await getGoogleTokens(ctx.kv, ctx.userId)
        if (!tokens) {
          return { toolName: name, status: "error", summary: "Calendar not connected", output: "Google Calendar is not connected." }
        }

        tokens = await refreshGoogleTokenIfNeeded(tokens, ctx)

        const slotDuration = Math.max(15, Math.min(Number(args.durationMinutes) || 60, 480))
        const daysAhead = Math.max(1, Math.min(Number(args.daysAhead) || 3, 7))
        const pref = String(args.preferredTimeRange || "any")

        const timeMin = new Date().toISOString()
        const timeMax = new Date(Date.now() + daysAhead * 24 * 3_600_000).toISOString()

        const calRes = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
            timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "50",
          })}`,
          { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
        )

        if (!calRes.ok) {
          return { toolName: name, status: "error", summary: "Calendar fetch failed", output: "Could not read calendar to find free slots." }
        }

        const calData = await calRes.json() as {
          items?: Array<{ start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }>
        }

        // Build busy intervals
        const busyIntervals: Array<{ start: number; end: number }> = (calData.items || [])
          .map(ev => ({
            start: new Date(ev.start?.dateTime || ev.start?.date || "").getTime(),
            end: new Date(ev.end?.dateTime || ev.end?.date || "").getTime(),
          }))
          .filter(i => !isNaN(i.start) && !isNaN(i.end))
          .sort((a, b) => a.start - b.start)

        // Find free slots between 8am and 9pm each day
        const freeSlots: string[] = []
        const slotMs = slotDuration * 60_000
        const prefRanges: Record<string, [number, number]> = {
          morning: [8, 12], afternoon: [12, 17], evening: [17, 21], any: [8, 21],
        }
        const [rangeStart, rangeEnd] = prefRanges[pref] || prefRanges.any

        for (let d = 0; d < daysAhead && freeSlots.length < 5; d++) {
          const dayStart = new Date()
          dayStart.setDate(dayStart.getDate() + d)
          dayStart.setHours(rangeStart, 0, 0, 0)
          const dayEnd = new Date(dayStart)
          dayEnd.setHours(rangeEnd, 0, 0, 0)

          // Skip past times on today
          const now = Date.now()
          let cursor = Math.max(dayStart.getTime(), now)

          // Round cursor up to next 30-min boundary
          const mins = new Date(cursor).getMinutes()
          if (mins > 0 && mins < 30) cursor = new Date(cursor).setMinutes(30, 0, 0)
          else if (mins > 30) cursor = new Date(cursor).setMinutes(0, 0, 0) + 3_600_000

          while (cursor + slotMs <= dayEnd.getTime() && freeSlots.length < 5) {
            const slotEnd = cursor + slotMs
            const conflict = busyIntervals.some(b => cursor < b.end && slotEnd > b.start)
            if (!conflict) {
              const dt = new Date(cursor)
              freeSlots.push(
                dt.toLocaleString("en-IN", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
              )
              cursor += slotMs // move past this slot
            } else {
              // Jump past the conflicting event
              const blocking = busyIntervals.find(b => cursor < b.end && slotEnd > b.start)
              cursor = blocking ? blocking.end : cursor + 30 * 60_000
            }
          }
        }

        if (freeSlots.length === 0) {
          return {
            toolName: name,
            status: "done",
            summary: "No free slots",
            output: `No free ${slotDuration}-minute slots found in the next ${daysAhead} days during ${pref} hours.`,
          }
        }

        return {
          toolName: name,
          status: "done",
          summary: `Found ${freeSlots.length} free slots`,
          output: `Available ${slotDuration}-minute slots:\n${freeSlots.map(s => `  - ${s}`).join("\n")}`,
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
  readCalendar: "Reading your calendar",
  createCalendarEvent: "Creating calendar event",
  createNote: "Saving a note",
  draftEmail: "Drafting your email",
  sendEmail: "Preparing email draft",
  confirmSendEmail: "Sending email",
  searchWeb: "Searching the web",
  searchNews: "Fetching latest news",
  searchYouTube: "Searching YouTube",
  logExpense: "Logging expense",
  getWeekSummary: "Building your week summary",
  updateGoalProgress: "Updating goal progress",
  lookupContact: "Looking up contact",
  saveContact: "Saving contact",
  updateCalendarEvent: "Updating calendar event",
  deleteCalendarEvent: "Deleting calendar event",
  findFreeSlot: "Finding free time slots",
}

export function getToolLabel(toolName: string): string {
  return TOOL_LABELS[toolName] || `Running ${toolName}`
}

