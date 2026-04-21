// ─── Agent Tool Policy — destructive-tool allowlist ──────────────────────────
//
// CRITICAL (C2 fix): Shared allowlist enforced by EVERY endpoint that runs
// agent tools without a human-in-the-loop confirmation. Prompt-injection via
// voice transcripts, multimodal image text, or Life Graph memory can coerce
// Gemini into emitting any tool call — we MUST block the destructive ones
// before `executeAgentTool()` is invoked.
//
// The only place destructive tools may run from is the agent-confirm flow
// (see `@/lib/ai/agent-confirm.ts`), which requires a single-use, HMAC-signed,
// userId-scoped token that was minted after an explicit user confirmation.

/**
 * Tools that are always safe to execute inside a streaming agent loop or the
 * Gemini Live tools endpoint. These are read-only or user-local writes with
 * no outbound side effects.
 */
export const AGENT_SAFE_TOOL_NAMES = new Set<string>([
  "searchMemory",
  "setReminder",
  "takeNote",
  "readCalendar",       // read-only
  "findFreeSlot",       // read-only
  "createNote",
  "draftEmail",         // drafts only — never calls Resend
  "searchWeb",
  "searchNews",
  "searchYouTube",
  "logExpense",
  "getWeekSummary",
  "updateGoalProgress",
  "lookupContact",
  "saveContact",
])

/**
 * Destructive or outbound-side-effect tools. Blocked at every entry point
 * except the agent-confirm token flow. NEVER remove an item from this list
 * without adding a confirmation gate first.
 */
export const AGENT_DESTRUCTIVE_TOOL_NAMES = new Set<string>([
  "sendEmail",
  "confirmSendEmail",
  "createCalendarEvent",
  "deleteCalendarEvent",
  "updateCalendarEvent",
])

export type AgentToolPolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: "destructive" | "unknown" }

export function classifyAgentTool(name: string): AgentToolPolicyDecision {
  if (AGENT_DESTRUCTIVE_TOOL_NAMES.has(name)) {
    return { allowed: false, reason: "destructive" }
  }
  if (AGENT_SAFE_TOOL_NAMES.has(name)) {
    return { allowed: true }
  }
  return { allowed: false, reason: "unknown" }
}
