import type { ActionType } from "@/types/actions"

type ActionTypeWithoutNone = Exclude<ActionType, "none">

export const ACTION_DESCRIPTIONS: Record<ActionTypeWithoutNone, string> = {
  web_search: "Search the web for real-time information and return a concise summary",
  draft_email: "Draft a professional or casual email based on your instructions",
  draft_message: "Compose a WhatsApp or text message ready to send",
  set_reminder: "Set a reminder for a specific task at a given time",
  take_note: "Save a quick note or idea for later reference",
  calculate: "Perform calculations, percentages, and math operations",
  translate: "Translate text between languages",
  summarize: "Create a concise summary of long content",
}

export function getActionLabel(type: ActionType): string {
  const labels: Record<ActionType, string> = {
    web_search: "Web Search",
    draft_email: "Draft Email",
    draft_message: "Draft Message",
    set_reminder: "Set Reminder",
    take_note: "Take Note",
    calculate: "Calculate",
    translate: "Translate",
    summarize: "Summarize",
    none: "None",
  }
  return labels[type] ?? "Unknown"
}

export const ACTION_TRIGGERS: Record<ActionTypeWithoutNone, string[]> = {
  web_search: ["search", "find", "look up", "what is", "who is"],
  draft_email: ["email", "write to", "compose", "send email"],
  draft_message: ["message", "text", "whatsapp", "tell them"],
  set_reminder: ["remind me", "remember to", "don't forget", "alert me"],
  take_note: ["note this", "save this", "remember this", "write down"],
  calculate: ["calculate", "how much", "what is X% of", "total", "split"],
  translate: ["translate", "in Hindi", "in Spanish", "how do you say"],
  summarize: ["summarize", "tldr", "in brief", "short version"],
}
