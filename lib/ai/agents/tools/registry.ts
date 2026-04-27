// ─── Agent Tool Capability Registry ──────────────────────────────────────────
//
// Single source of truth for all tool safety metadata.
//
// Every tool that Gemini can autonomously call is defined here with:
// - its name and description (for Gemini function declarations)
// - its JSON Schema parameters (for Gemini function declarations)
// - its human-readable label
// - its risk classification
// - the execution surfaces it is allowed on
// - whether it requires confirmation
// - whether it runs in parallel or sequentially
// - its executor family
//
// All policy, dispatch, labelling, and declaration exports in the rest of
// the codebase are DERIVED from this registry. Adding a new tool should only
// require updating this file.
//
// CRITICAL: the `riskClass` and `allowedSurfaces` fields are the authoritative
// safety model. No other file may hardcode a tool as safe or destructive.

// ─── Types ───────────────────────────────────────────────────────────────────

export type ToolRiskClass = "safe" | "destructive"

export type ToolExecutionSurface = "chat_loop" | "live_execute" | "confirmed_agent"

export type ToolExecutionMode = "parallel" | "sequential"

export type ToolExecutorFamily =
  | "memory_productivity"
  | "calendar"
  | "communication"
  | "search"
  | "budget"

export interface ToolCapability {
  /** Unique tool name — must match Gemini function declaration name */
  name: string

  /** Description shown to the model in function declarations */
  description: string

  /** JSON Schema parameters for Gemini function declarations */
  parameters: Record<string, unknown>

  /** Human-readable label shown in the UI / SSE events */
  label: string

  /** Risk classification */
  riskClass: ToolRiskClass

  /** Which execution surfaces are allowed */
  allowedSurfaces: readonly ToolExecutionSurface[]

  /** Whether this tool requires explicit user confirmation before running */
  requiresConfirmation: boolean

  /** Whether this tool runs sequentially (depends on previous steps) or in parallel */
  executionMode: ToolExecutionMode

  /** Which executor module handles this tool */
  executorFamily: ToolExecutorFamily

  /** Optional per-tool timeout override (default: 5000ms) */
  timeoutMs?: number
}

// ─── Registry ────────────────────────────────────────────────────────────────

const TOOL_CAPABILITIES: readonly ToolCapability[] = [
  // ── Memory / Productivity ─────────────────────────────────────────────────
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
    label: "Searching your memory",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "memory_productivity",
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
    label: "Setting a reminder",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "sequential",
    executorFamily: "memory_productivity",
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
    label: "Saving a note",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "sequential",
    executorFamily: "memory_productivity",
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
    label: "Saving a note",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "sequential",
    executorFamily: "memory_productivity",
  },
  {
    name: "getWeekSummary",
    description:
      "Generate a summary of the user's week — their goals progress, streak status, and key events. Use when user asks 'how was my week', 'summarize my week', 'week review karo'.",
    parameters: {
      type: "object",
      properties: {},
    },
    label: "Building your week summary",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "memory_productivity",
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
    label: "Updating goal progress",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "sequential",
    executorFamily: "memory_productivity",
  },

  // ── Calendar ──────────────────────────────────────────────────────────────
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
    label: "Reading your calendar",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "calendar",
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
    label: "Creating calendar event",
    riskClass: "destructive",
    allowedSurfaces: ["confirmed_agent"],
    requiresConfirmation: true,
    executionMode: "sequential",
    executorFamily: "calendar",
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
    label: "Updating calendar event",
    riskClass: "destructive",
    allowedSurfaces: ["confirmed_agent"],
    requiresConfirmation: true,
    executionMode: "sequential",
    executorFamily: "calendar",
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
    label: "Deleting calendar event",
    riskClass: "destructive",
    allowedSurfaces: ["confirmed_agent"],
    requiresConfirmation: true,
    executionMode: "sequential",
    executorFamily: "calendar",
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
    label: "Finding free time slots",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "calendar",
  },

  // ── Communication ───────────────────────────────────────────────────────────
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
    label: "Drafting your email",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "sequential",
    executorFamily: "communication",
  },
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
    label: "Preparing email draft",
    riskClass: "destructive",
    allowedSurfaces: ["confirmed_agent"],
    requiresConfirmation: true,
    executionMode: "sequential",
    executorFamily: "communication",
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
    label: "Sending email",
    riskClass: "destructive",
    allowedSurfaces: ["confirmed_agent"],
    requiresConfirmation: true,
    executionMode: "sequential",
    executorFamily: "communication",
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
    label: "Looking up contact",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "communication",
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
    label: "Saving contact",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute"],
    requiresConfirmation: false,
    executionMode: "sequential",
    executorFamily: "communication",
  },

  // ── Search ────────────────────────────────────────────────────────────────
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
          description:
            "Platform to search on. Use 'twitter' for tweets/X posts, 'reddit' for Reddit discussions, 'youtube' for videos, 'news' for news articles. Default: general.",
        },
      },
      required: ["query"],
    },
    label: "Searching the web",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "search",
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
    label: "Fetching latest news",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "search",
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
    label: "Searching YouTube",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute"],
    requiresConfirmation: false,
    executionMode: "parallel",
    executorFamily: "search",
  },

  // ── Budget ────────────────────────────────────────────────────────────────
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
    label: "Logging expense",
    riskClass: "safe",
    allowedSurfaces: ["chat_loop", "live_execute", "confirmed_agent"],
    requiresConfirmation: false,
    executionMode: "sequential",
    executorFamily: "budget",
  },
]

// ─── Lookups ─────────────────────────────────────────────────────────────────

/** Fast name -> capability lookup */
const _toolByName = new Map<string, ToolCapability>(
  TOOL_CAPABILITIES.map((c) => [c.name, c]),
)

export function getToolCapability(name: string): ToolCapability | undefined {
  return _toolByName.get(name)
}

export function getAllToolCapabilities(): readonly ToolCapability[] {
  return TOOL_CAPABILITIES
}

export function getToolNames(): readonly string[] {
  return TOOL_CAPABILITIES.map((c) => c.name)
}

export function isKnownTool(name: string): boolean {
  return _toolByName.has(name)
}

// ─── Derived sets (no other file should build these manually) ────────────────

export const AGENT_SAFE_TOOL_NAMES = new Set<string>(
  TOOL_CAPABILITIES
    .filter((c) => c.riskClass === "safe")
    .map((c) => c.name),
)

export const AGENT_DESTRUCTIVE_TOOL_NAMES = new Set<string>(
  TOOL_CAPABILITIES
    .filter((c) => c.riskClass === "destructive")
    .map((c) => c.name),
)

/** Tools that may run inside a confirmed agent plan */
export const AGENT_CONFIRM_EXECUTION_TOOL_NAMES = new Set<string>(
  TOOL_CAPABILITIES
    .filter((c) => c.allowedSurfaces.includes("confirmed_agent"))
    .map((c) => c.name),
)

/** Tools that must run sequentially within a confirmed plan */
export const AGENT_CONFIRM_SEQUENTIAL_TOOL_NAMES = new Set<string>(
  TOOL_CAPABILITIES
    .filter((c) => c.executionMode === "sequential")
    .map((c) => c.name),
)

/** Tools allowed in the live execute endpoint */
export const AGENT_LIVE_EXECUTE_TOOL_NAMES = new Set<string>(
  TOOL_CAPABILITIES
    .filter((c) => c.allowedSurfaces.includes("live_execute"))
    .map((c) => c.name),
)

/** Tools allowed in the chat-stream agent loop */
export const AGENT_CHAT_LOOP_TOOL_NAMES = new Set<string>(
  TOOL_CAPABILITIES
    .filter((c) => c.allowedSurfaces.includes("chat_loop"))
    .map((c) => c.name),
)
