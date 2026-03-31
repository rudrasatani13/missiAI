// @ts-ignore
import { nanoid } from "nanoid"
import type { Message } from "@/types"
import type { MemoryFact } from "@/types/memory"
import { fetchWithTimeout } from "@/lib/client/fetch-with-timeout"

const GEMINI_FLASH_MODEL = "gemini-3-flash-preview"
const MAX_FACTS = 50
const EXTRACTION_TIMEOUT_MS = 15_000

/**
 * Use Gemini Flash to extract factual statements from the last few messages,
 * merge with existing facts (dedup via simple includes() check), and return
 * the combined array capped at 50.
 *
 * Only called every 5th interaction — the caller checks interactionCount.
 */
export async function extractMemoryFacts(
  conversation: Message[],
  existingFacts: MemoryFact[],
  apiKey: string,
): Promise<MemoryFact[]> {
  // Only send the last 6 messages to keep cost down
  const recent = conversation.slice(-6)

  const convoText = recent
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n")

  const systemPrompt = `You are a memory extraction system. Given a conversation extract KEY FACTS about the user.

RULES:
- Extract ONLY factual information about the user: name, preferences, job, interests, goals, problems, relationships, location, etc.
- Each fact must be one short sentence (max 200 chars).
- Provide 1-5 topic keyword tags per fact for retrieval (lowercase, single words).
- If no new facts worth remembering, return an empty array [].
- Do NOT include conversation summaries — only factual user info.

Respond ONLY with a valid JSON array. No preamble, no markdown, no explanation.

Example output:
[{"text":"User's name is Rahul","tags":["name","rahul"]},{"text":"User works as a frontend developer","tags":["work","developer","frontend"]}]`

  const userMessage = `CONVERSATION:\n${convoText}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FLASH_MODEL}:generateContent`

  let extracted: Array<{ text: string; tags: string[] }> = []

  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          },
        }),
      },
      EXTRACTION_TIMEOUT_MS
    )

    if (!res.ok) {
      console.error(`Memory extraction Gemini error ${res.status}`)
      return existingFacts
    }

    const data = await res.json()
    const rawText: string =
      data?.candidates?.[0]?.content?.parts
        ?.filter((p: any) => typeof p.text === "string")
        .map((p: any) => p.text)
        .join("") ?? ""

    // Strip markdown fences if model wraps output
    const cleaned = rawText
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/gi, "")
      .trim()

    extracted = JSON.parse(cleaned)

    if (!Array.isArray(extracted)) {
      extracted = []
    }
  } catch {
    // Parse failure or network error — return existing facts unchanged
    return existingFacts
  }

  // Build new MemoryFact objects
  const now = Date.now()
  const newFacts: MemoryFact[] = extracted
    .filter((e) => typeof e.text === "string" && e.text.length > 0)
    .map((e) => ({
      id: nanoid(8),
      text: e.text.slice(0, 200),
      tags: (Array.isArray(e.tags) ? e.tags : []).slice(0, 5).map(String),
      createdAt: now,
      accessCount: 0,
    }))

  // Merge: skip duplicates (if existing fact text includes new fact text or vice versa)
  const merged = [...existingFacts]

  for (const nf of newFacts) {
    const nfLower = nf.text.toLowerCase()
    const isDuplicate = merged.some((ef) => {
      const efLower = ef.text.toLowerCase()
      return efLower.includes(nfLower) || nfLower.includes(efLower)
    })
    if (!isDuplicate) {
      merged.push(nf)
    }
  }

  // Cap at MAX_FACTS — keep newest
  if (merged.length > MAX_FACTS) {
    merged.sort((a, b) => b.createdAt - a.createdAt)
    merged.length = MAX_FACTS
  }

  return merged
}
