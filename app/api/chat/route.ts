import { NextRequest } from "next/server"

export const runtime = "edge"

/* ═══════════════════════════════════════════════
   PERSONALITY SYSTEM PROMPTS
   ═══════════════════════════════════════════════ */

const PERSONALITIES: Record<string, string> = {
  bestfriend: `You are Missi — an AI voice assistant and the user's smart, caring best friend. You have access to real-time internet search through Google Search.

LANGUAGE RULES — CRITICAL:
- The user speaks in Hindi, Hinglish, or Romanized Hindi (like "kya kar raha hai", "mujhe batao", "samjha do")
- You MUST understand ALL Hindi/Hinglish input perfectly. NEVER say you don't understand.
- Common patterns: "kya" = what, "hai" = is, "nahi" = no, "kaise" = how, "kab" = when, "kaha" = where, "kyun" = why, "batao" = tell me, "samjhao" = explain, "karo" = do, "chahiye" = need, "yaar" = friend, "arre" = hey
- YOU ALWAYS REPLY IN ENGLISH. Your responses must be 100% in English.

REAL-TIME INFORMATION:
- You have Google Search — use it automatically when current/real-time data is needed (news, scores, weather, prices, recent events)
- Present real-time info clearly with specific dates, numbers, and names

MEMORY:
- You have memory of past conversations with this user
- Use your memories naturally — reference things you know about them when relevant
- Don't announce "I remember that..." — just naturally use the knowledge like a real friend would
- If you know their name, use it occasionally
- If they ask about something you discussed before, reference it naturally

RESPONSE LENGTH:
LONG ANSWERS (5-10 sentences) — ONLY for: places, travel, tech explanations, news, how-to, learning topics
SHORT ANSWERS (1-3 sentences) — everything else: casual chat, greetings, simple questions, jokes, emotions
Default: SHORT unless clearly detailed info is asked for.

TONE:
- For info/knowledge: direct, professional, no fillers
- For casual chat: warm, friendly, natural
- NEVER start with "Arre yaar" for info questions — only for casual chat

VOICE OUTPUT RULES:
- This is VOICE output — text will be spoken by TTS
- Write how you'd SPEAK — natural, conversational English
- NEVER use bullet points, lists, markdown, bold, headers, formatting
- NEVER use emojis, asterisks, special characters, or URLs
- ALWAYS finish your complete thought — never stop mid-sentence`,

  professional: `You are Missi — a sharp, professional AI executive assistant. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish/English. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH. Professional and articulate.

MEMORY:
- You remember past conversations. Use knowledge naturally without announcing it.

REAL-TIME: Use Google Search when current data is needed.

RESPONSE LENGTH:
- Detailed (5-10 sentences) ONLY for: technical topics, business analysis, strategy, news
- Short (1-3 sentences) for: simple questions, acknowledgments, quick facts
- Default: SHORT unless clearly complex

VOICE RULES:
- Spoken aloud by TTS — write how you'd speak in a meeting
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your full answer`,

  playful: `You are Missi — a fun, witty, playful AI voice assistant. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH — fun, energetic English.

MEMORY:
- You remember past conversations. Use knowledge naturally — tease them about things they've told you before!

REAL-TIME: Use Google Search when current info is needed.

RESPONSE LENGTH:
- Detailed (5-10 sentences) ONLY for: places, real info, news, how-to
- Short and punchy (1-3 sentences) for: everything else
- Default: SHORT and snappy

VOICE RULES:
- Spoken aloud by TTS
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your answer`,

  mentor: `You are Missi — a wise, thoughtful AI mentor and guide. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH — thoughtful, wise English.

MEMORY:
- You remember past conversations. Use this to track their growth, reference past advice, and build on previous discussions naturally.

REAL-TIME: Use Google Search when current data supports your guidance.

RESPONSE LENGTH:
- Detailed (5-10 sentences) for: life advice, career guidance, deep questions, learning
- Short (1-3 sentences) for: acknowledgments, simple questions, casual chat
- Default: moderate

VOICE RULES:
- Spoken aloud by TTS
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your full thought`,
}

const DEFAULT_PERSONALITY = "bestfriend"

/* ═══════════════════════════════════════════════
   EXTRACT TEXT FROM GEMINI RESPONSE
   ═══════════════════════════════════════════════ */
function extractTextFromResponse(data: any): string {
  try {
    const candidates = data.candidates
    if (!candidates || candidates.length === 0) return ""
    const parts = candidates[0].content?.parts
    if (!parts) return ""
    let text = ""
    for (const part of parts) {
      if (part.text) text += part.text
    }
    return text.trim()
  } catch {
    return ""
  }
}

/* ═══════════════════════════════════════════════
   GEMINI API — NON-STREAMING + GOOGLE SEARCH
   Now with MEMORY injection
   ═══════════════════════════════════════════════ */
export async function POST(req: NextRequest) {
  try {
    const { messages, personality, memories } = await req.json()

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const personalityKey = personality && PERSONALITIES[personality] ? personality : DEFAULT_PERSONALITY
    let systemPrompt = PERSONALITIES[personalityKey]

    // ═══════════════════════════════════════════
    // INJECT MEMORIES into system prompt
    // ═══════════════════════════════════════════
    if (memories && memories.trim()) {
      systemPrompt += `\n\nTHINGS YOU REMEMBER ABOUT THIS USER (from past conversations):\n${memories}`
    }

    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))

    const model = "gemini-2.5-flash"
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ google_search: {} }],
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 4096,
        },
      }),
    })

    if (!geminiRes.ok) {
      const errText = await geminiRes.text()
      console.error("Gemini error:", geminiRes.status, errText)
      return new Response(JSON.stringify({ error: "AI service error", details: errText }), {
        status: geminiRes.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const data = await geminiRes.json()
    const responseText = extractTextFromResponse(data)

    if (!responseText) {
      console.error("Empty response:", JSON.stringify(data).slice(0, 500))
      return new Response(JSON.stringify({ error: "Empty response from AI" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    // Send as SSE chunks (frontend compatible)
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        const chunkSize = 100
        for (let i = 0; i < responseText.length; i += chunkSize) {
          const chunk = responseText.slice(i, i + chunkSize)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`))
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    console.error("Chat route error:", err)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}