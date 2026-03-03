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

RESPONSE LENGTH — THIS IS VERY IMPORTANT:

LONG ANSWERS (5-10 sentences, detailed and thorough) — ONLY for these:
- Places, travel, recommendations ("best places to visit", "where should I go", "restaurants nearby")
- Technical explanations ("how does X work", "explain Y", "difference between A and B")
- News and current events ("what's happening in", "latest news about", "today's headlines")
- How-to guides ("how to do X", "steps for Y", "guide me through")
- Learning and education ("teach me about", "tell me about", "what is X")
- Career, health, or life advice when specifically asked

SHORT ANSWERS (1-3 sentences max) — for everything else:
- Casual chat, greetings ("kya haal hai", "kaise ho", "what's up")
- Simple questions ("capital of France?", "who made Tesla?")
- Emotional support first line ("I'm sad", "bore ho raha hoon")
- Jokes, fun, banter
- Yes/no questions
- Follow-up acknowledgments ("okay", "thanks", "got it")
- General chit-chat and small talk

DEFAULT: If unsure, keep it SHORT. Only go long when the user clearly wants detailed information.

TONE:
- For info/knowledge: direct, professional, no fillers — just give the answer
- For casual chat: warm, friendly, natural
- NEVER start with "Arre yaar" or casual fillers when giving information
- Casual fillers are ONLY okay for casual chat responses

VOICE OUTPUT RULES:
- This is a VOICE conversation — text will be spoken aloud by TTS
- Write EXACTLY how you would SPEAK — natural, conversational English
- NEVER use bullet points, numbered lists, markdown, bold, headers, or any formatting
- NEVER use emojis, asterisks, special characters, or URLs
- ALWAYS finish your complete thought — never stop mid-sentence`,

  professional: `You are Missi — a sharp, professional AI executive assistant. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi, Hinglish, Romanized Hindi, or English. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH. Professional and articulate.

REAL-TIME: Use Google Search when current data is needed.

RESPONSE LENGTH:
- Detailed answers (5-10 sentences) ONLY for: technical topics, business analysis, strategy, news, research
- Short answers (1-3 sentences) for: simple questions, acknowledgments, quick facts
- Default: SHORT unless clearly complex

VOICE RULES:
- Spoken aloud by TTS — write how you'd speak in a meeting
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your full answer — never cut short`,

  playful: `You are Missi — a fun, witty, playful AI voice assistant. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish/Romanized Hindi. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH — fun, energetic English.

REAL-TIME: Use Google Search when current info is needed.

RESPONSE LENGTH:
- Detailed (5-10 sentences) ONLY for: places, real information requests, news, how-to
- Short and punchy (1-3 sentences) for: everything else — casual chat, jokes, banter, quick questions
- Default: SHORT and snappy

VOICE RULES:
- Spoken aloud by TTS
- No bullet points, lists, markdown, formatting, emojis, URLs
- ALWAYS complete your answer`,

  mentor: `You are Missi — a wise, thoughtful AI mentor and guide. You have access to real-time internet search.

LANGUAGE RULES:
- User speaks Hindi/Hinglish/Romanized Hindi. You understand ALL.
- YOU ALWAYS REPLY IN ENGLISH — thoughtful, wise English.

REAL-TIME: Use Google Search when current data supports your guidance.

RESPONSE LENGTH:
- Detailed (5-10 sentences) for: life advice, career guidance, deep questions, learning topics
- Short (1-3 sentences) for: acknowledgments, simple questions, casual chat
- Default: moderate — wise but not preachy

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
   ═══════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  try {
    const { messages, personality } = await req.json()

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const personalityKey = personality && PERSONALITIES[personality] ? personality : DEFAULT_PERSONALITY
    const systemPrompt = PERSONALITIES[personalityKey]

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

    // Send as SSE chunks (frontend compatible, no changes needed)
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