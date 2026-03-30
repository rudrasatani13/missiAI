import type { Message } from "@/types"
import { callAIDirect } from "./ai.service"

const MAX_MEMORY_FACTS = 30

/**
 * Extract key facts from a conversation using AI and merge with existing memories.
 * Does NOT touch KV — callers are responsible for fetching existing memories
 * and persisting the result via saveUserMemories().
 */
export async function extractMemories(
  conversation: Message[],
  existingMemories: string,
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

  return extracted.trim() || existingMemories
}
