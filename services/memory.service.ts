import type { Message, KVStore } from "@/types"
import { callAIDirect } from "./ai.service"

const MEMORY_KEY_PREFIX = "memories:"
const MAX_MEMORY_FACTS = 30

// ─── Sanitization ─────────────────────────────────────────────────────────────

/**
 * Strip common prompt injection patterns before injecting memories into system prompt.
 * Memories come from KV storage — user could have crafted them via earlier conversations.
 */
export function sanitizeMemory(memory: string): string {
  return memory
    // ── Instruction-format tags ──────────────────────────────────────────
    .replace(/\[INST\]/gi, "")
    .replace(/\[\/INST\]/gi, "")
    .replace(/<<<[\s\S]*?>>>/g, "")
    .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/gi, "")
    .replace(/<\|system\|>[\s\S]*?<\|end\|>/gi, "")
    // ── Role prefixes ────────────────────────────────────────────────────
    .replace(/\bSYSTEM\s*:/gi, "")
    .replace(/\bUSER\s*:/gi, "")
    .replace(/\bASSISTANT\s*:/gi, "")
    .replace(/\bHUMAN\s*:/gi, "")
    .replace(/\bAI\s*:/gi, "")
    // ── Direct override commands ─────────────────────────────────────────
    .replace(/\bIGNORE\s+(ALL\s+)?PREVIOUS\s+INSTRUCTIONS?\b/gi, "")
    .replace(/\bDISREGARD\s+ALL\s+PREVIOUS\b/gi, "")
    .replace(/\bFORGET\s+(EVERYTHING|ALL|PRIOR)\b/gi, "")
    .replace(/\bYOU\s+ARE\s+NOW\b/gi, "")
    .replace(/\bACT\s+AS\s+(IF\s+YOU\s+ARE|A|AN)\b/gi, "")
    .replace(/\bNEW\s+INSTRUCTIONS?\b/gi, "")
    .replace(/\bOVERRIDE\s+(SYSTEM|PROMPT|INSTRUCTIONS?)\b/gi, "")
    .replace(/\bDO\s+NOT\s+FOLLOW\b/gi, "")
    .replace(/\bIGNORE\s+SAFETY\b/gi, "")
    // ── Markdown structure (keeps plain text only) ───────────────────────
    .replace(/#{1,6}\s/g, "")
    .trim()
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getMemory(userId: string, kv: KVStore): Promise<string> {
  const raw = await kv.get(`${MEMORY_KEY_PREFIX}${userId}`)
  if (!raw) return ""
  return sanitizeMemory(raw)
}

// ─── Write ────────────────────────────────────────────────────────────────────

/**
 * Extract key facts from a conversation using AI, merge with existing memories, save to KV.
 * Returns the updated memory string.
 */
export async function saveMemory(
  userId: string,
  conversation: Message[],
  existingMemories: string,
  kv: KVStore
): Promise<string> {
  const convoText = conversation
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")

  const systemPrompt = `You are a memory extraction system. Extract KEY FACTS about the user from conversations.

RULES:
- Extract ONLY factual information about the user (name, preferences, job, interests, goals, problems, etc.)
- Keep each fact on a separate line, starting with "- "
- Be concise — each fact should be one short sentence
- Merge with existing memories — update if info changed, add if new, keep if still relevant
- Remove outdated info that the new conversation contradicts
- Maximum ${MAX_MEMORY_FACTS} facts total
- If no new facts worth remembering, return the existing memories as-is
- Do NOT include conversation summaries — only factual user info

OUTPUT FORMAT (just the facts, nothing else):
- User's name is ...
- User works as ...
- User is interested in ...`

  const userMessage = `EXISTING MEMORIES (merge with these, don't duplicate):
${existingMemories || "None yet."}

NEW CONVERSATION:
${convoText}`

  const extracted = await callAIDirect(systemPrompt, userMessage, {
    temperature: 0.3,
    maxOutputTokens: 1024,
  })

  const newMemories = extracted.trim()
  if (!newMemories) return existingMemories

  await kv.put(`${MEMORY_KEY_PREFIX}${userId}`, newMemories)
  return newMemories
}
