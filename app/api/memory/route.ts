import { NextRequest } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

/* ═══════════════════════════════════════════════
   GET — Load user's memories
   ═══════════════════════════════════════════════ */
export async function GET(req: NextRequest) {
  try {
    const userId = req.nextUrl.searchParams.get("userId")
    if (!userId) {
      return new Response(JSON.stringify({ memories: "" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const { env } = getRequestContext()
    const kv = (env as any).MISSI_MEMORY

    if (!kv) {
      console.error("KV binding MISSI_MEMORY not found")
      return new Response(JSON.stringify({ memories: "" }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const memories = await kv.get(`memories:${userId}`)

    return new Response(
      JSON.stringify({ memories: memories || "" }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("Memory load error:", err)
    return new Response(JSON.stringify({ memories: "" }), {
      headers: { "Content-Type": "application/json" },
    })
  }
}

/* ═══════════════════════════════════════════════
   POST — Summarize conversation & save memories

   Takes the conversation history, asks Gemini
   to extract key facts, then merges with
   existing memories and saves to KV.
   ═══════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    const { userId, conversation, existingMemories } = await req.json()

    if (!userId || !conversation || conversation.length < 2) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ success: false, error: "No API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    // ═══════════════════════════════════════════
    // Step 1: Ask Gemini to extract key facts
    // from this conversation
    // ═══════════════════════════════════════════
    const convoText = conversation
      .map((m: { role: string; content: string }) => `${m.role}: ${m.content}`)
      .join("\n")

    const summarizePrompt = `You are a memory extraction system. Analyze this conversation and extract KEY FACTS about the user that would be useful to remember for future conversations.

EXISTING MEMORIES (merge with these, don't duplicate):
${existingMemories || "None yet."}

NEW CONVERSATION:
${convoText}

RULES:
- Extract ONLY factual information about the user (name, preferences, job, interests, goals, problems, etc.)
- Keep each fact on a separate line, starting with "- "
- Be concise — each fact should be one short sentence
- Merge with existing memories — update if info changed, add if new, keep if still relevant
- Remove outdated info that the new conversation contradicts
- Maximum 30 facts total
- If no new facts worth remembering, return the existing memories as-is
- Do NOT include conversation summaries — only factual user info

OUTPUT FORMAT (just the facts, nothing else):
- User's name is ...
- User works as ...
- User is interested in ...`

    const model = "gemini-2.5-flash"
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: summarizePrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
        },
      }),
    })

    if (!geminiRes.ok) {
      console.error("Gemini summarize error:", geminiRes.status)
      return new Response(JSON.stringify({ success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await geminiRes.json()
    const newMemories = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ""

    if (!newMemories) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      })
    }

    // ═══════════════════════════════════════════
    // Step 2: Save to Cloudflare KV
    // ═══════════════════════════════════════════
    const { env } = getRequestContext()
    const kv = (env as any).MISSI_MEMORY

    if (!kv) {
      console.error("KV binding not found")
      return new Response(JSON.stringify({ success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Save memories (no expiration — permanent storage)
    await kv.put(`memories:${userId}`, newMemories)

    return new Response(
      JSON.stringify({ success: true, memories: newMemories }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("Memory save error:", err)
    return new Response(JSON.stringify({ success: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}