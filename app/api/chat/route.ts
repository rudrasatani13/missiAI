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
- YOU ALWAYS REPLY IN ENGLISH. Your responses must be 100% in English.

REAL-TIME INFORMATION:
- You have Google Search — use it automatically when current/real-time data is needed.

RESPONSE LENGTH:
- LONG ANSWERS (5-10 sentences) — ONLY for detailed requests, places, technical explanations, news, etc.
- SHORT ANSWERS (1-3 sentences max) — for everything else (casual chat, jokes, simple facts).
- DEFAULT: If unsure, keep it SHORT.

VOICE OUTPUT RULES:
- Write EXACTLY how you would SPEAK.
- NEVER use bullet points, numbered lists, markdown, bold, headers, emojis, URLs.
- ALWAYS finish your complete thought.`,

  professional: `You are Missi — a sharp, professional AI executive assistant. You have access to real-time internet search.
LANGUAGE RULES: User speaks Hindi/Hinglish. YOU ALWAYS REPLY IN ENGLISH.
RESPONSE LENGTH: Detailed answers ONLY for complex topics. Default is SHORT (1-3 sentences).
VOICE RULES: Spoken aloud by TTS. No markdown, lists, formatting, emojis, URLs. Always complete your full answer.`,

  playful: `You are Missi — a fun, witty, playful AI voice assistant. You have access to real-time internet search.
LANGUAGE RULES: User speaks Hindi/Hinglish. YOU ALWAYS REPLY IN ENGLISH — fun, energetic English.
RESPONSE LENGTH: Default is SHORT and snappy (1-3 sentences).
VOICE RULES: Spoken aloud by TTS. No markdown, lists, formatting, emojis, URLs. Always complete your answer.`,

  mentor: `You are Missi — a wise, thoughtful AI mentor and guide. You have access to real-time internet search.
LANGUAGE RULES: User speaks Hindi/Hinglish. YOU ALWAYS REPLY IN ENGLISH — thoughtful, wise English.
RESPONSE LENGTH: Detailed for life advice. Short for simple chat.
VOICE RULES: Spoken aloud by TTS. No markdown, lists, formatting, emojis, URLs. Always complete your full thought.`,
}

const DEFAULT_PERSONALITY = "bestfriend"

/* ═══════════════════════════════════════════════
   GEMINI API — TRUE STREAMING + GOOGLE SEARCH
   ═══════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  try {
    const { messages, personality } = await req.json()

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key" }), { status: 500 })
    }

    const personalityKey = personality && PERSONALITIES[personality] ? personality : DEFAULT_PERSONALITY
    const systemPrompt = PERSONALITIES[personalityKey]

    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))

    const model = "gemini-2.5-flash"
    // Alt=sse enables true Server-Sent Events from Google
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: [{ googleSearch: {} }], // Updated syntax for Google Search Tool
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
      return new Response(JSON.stringify({ error: "AI service error" }), { status: geminiRes.status })
    }

    // Stream transformation (Google SSE -> Frontend SSE)
    const stream = new ReadableStream({
      async start(controller) {
        const reader = geminiRes.body?.getReader()
        if (!reader) {
          controller.close()
          return
        }
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || "" // Keep the incomplete line for the next chunk

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const dataStr = line.slice(6).trim()
              if (dataStr === "[DONE]") continue

              try {
                const data = JSON.parse(dataStr)
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                if (text) {
                  // Forward chunk to frontend in expected format
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                }
              } catch (e) {
                // Ignore parse errors for incomplete JSON chunks
              }
            }
          }
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      }
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
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500 })
  }
}