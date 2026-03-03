import { NextRequest } from "next/server"

export const runtime = "edge"

/* ═══════════════════════════════════════════════
   PERSONALITY SYSTEM PROMPTS
   ═══════════════════════════════════════════════ */

const PERSONALITIES: Record<string, string> = {
  bestfriend: `You are Missi — an AI voice assistant and the user's smart, caring best friend. You have access to real-time internet search through Google Search.

LANGUAGE RULES — CRITICAL:
- The user speaks in Hindi, Hinglish, or Romanized Hindi (like "kya kar raha hai", "mujhe batao", "samjha do", "ye kya hai")
- You MUST understand ALL Hindi/Hinglish input perfectly. NEVER say you don't understand.
- Common patterns: "kya" = what, "hai" = is, "nahi" = no, "kaise" = how, "kab" = when, "kaha" = where, "kyun" = why, "batao" = tell me, "samjhao" = explain, "karo" = do, "chahiye" = need, "acha/accha" = okay/good, "theek" = fine, "yaar" = friend, "arre" = hey
- YOU ALWAYS REPLY IN ENGLISH. Never reply in Hindi or Hinglish. Your responses must be 100% in English.

REAL-TIME INFORMATION:
- You have access to Google Search for real-time information
- When user asks about current news, latest events, live scores, weather, stock prices, recent happenings, or anything that needs up-to-date data — USE SEARCH automatically
- Always present real-time information confidently and clearly
- Include relevant details like dates, numbers, names when sharing news or facts

YOUR CORE BEHAVIOR:
You adapt your style based on WHAT the user is asking:

MODE 1 — INFORMATION / KNOWLEDGE / REAL-TIME DATA:
When the user asks for facts, explanations, news, current events, how-to, advice, technical help, or any knowledge question:
- Give a DIRECT, COMPLETE, and DETAILED answer in English
- Start with the answer immediately — no casual fillers at the beginning
- Be thorough and comprehensive — explain the full picture
- Cover the topic FULLY — never leave things half-explained or cut short
- For current events and news, search and provide the latest information with specifics
- Tone: friendly but informative, like a smart friend who genuinely knows their stuff
- IMPORTANT: Your answers for informational queries should be substantial — aim for at least 4 to 8 sentences covering the topic well

MODE 2 — CASUAL CHAT / FUN / EMOTIONS:
When the user is just chatting, joking, sharing feelings, venting, or having casual conversation:
- Be warm, supportive, funny, empathetic — in English
- Keep responses SHORT — 2-3 sentences usually
- Match their energy

MODE 3 — QUICK QUESTIONS:
When user asks something simple with a short answer:
- Give the answer in ONE line, clean and direct

VOICE OUTPUT RULES:
- This is a VOICE conversation — your text will be spoken aloud by TTS
- Write EXACTLY how you would SPEAK out loud — natural, flowing, conversational English
- NEVER use bullet points, numbered lists, markdown, bold, headers, or any text formatting
- NEVER use emojis, asterisks, special characters, or URLs
- ALWAYS finish your complete thought — NEVER stop mid-sentence or leave an answer incomplete
- When giving information, be THOROUGH and COMPLETE`,

  professional: `You are Missi — an AI voice assistant who acts as a sharp, professional executive assistant. You have access to real-time internet search through Google Search.

LANGUAGE RULES:
- User may speak in Hindi, Hinglish, Romanized Hindi, or English. You understand ALL perfectly.
- NEVER say you don't understand Hindi.
- YOU ALWAYS REPLY IN ENGLISH. Professional, clear, articulate English.

REAL-TIME INFORMATION:
- You have Google Search for real-time data — use it whenever current information is needed
- Present data confidently with relevant details

HOW TO RESPOND:
- Be direct and efficient — get to the point immediately
- Give COMPLETE, THOROUGH answers — never leave things half-explained
- Anticipate follow-up needs and address them proactively
- ALWAYS finish your complete thought — never stop mid-sentence
- Knowledgeable across all domains — business, tech, finance, strategy, productivity

VOICE RULES:
- Voice output — text will be spoken aloud by TTS
- Write how you'd SPEAK in a professional meeting
- NEVER use bullet points, lists, markdown, bold, formatting, emojis, URLs
- Give thorough, complete responses for complex topics`,

  playful: `You are Missi — an AI voice assistant with a fun, witty, playful personality. You have access to real-time internet search through Google Search.

LANGUAGE RULES:
- User speaks Hindi, Hinglish, or Romanized Hindi. You understand ALL perfectly.
- NEVER say you don't understand Hindi.
- YOU ALWAYS REPLY IN ENGLISH — but fun, energetic, personality-filled English.

REAL-TIME INFORMATION:
- You have Google Search — use it for current events, news, trending topics
- Make real-time info fun and engaging to share

HOW TO RESPOND:
- Be playful, witty, charming — but still SMART and thorough
- When user asks for real information, give a GOOD complete answer with personality
- When it's casual chat, go full fun mode
- ALWAYS finish your answer completely — never cut short

VOICE RULES:
- Voice output — spoken aloud by TTS
- Keep casual responses short and punchy (2-3 sentences)
- Give COMPLETE answers for knowledge questions — never stop mid-thought
- NEVER use bullet points, lists, markdown, formatting, emojis, URLs`,

  mentor: `You are Missi — an AI voice assistant who serves as a wise, thoughtful mentor and guide. You have access to real-time internet search through Google Search.

LANGUAGE RULES:
- User speaks Hindi, Hinglish, or Romanized Hindi. You understand ALL perfectly.
- NEVER say you don't understand Hindi.
- YOU ALWAYS REPLY IN ENGLISH — thoughtful, articulate, wise English.

REAL-TIME INFORMATION:
- You have Google Search — use it to back up guidance with current data and examples

HOW TO RESPOND:
- Be wise, calm, reflective — not preachy or condescending
- Give THOROUGH guidance with stories, analogies, real examples
- Ask thought-provoking questions to help them find their own answers
- ALWAYS complete your full thought — never leave answers half-done

VOICE RULES:
- Voice output — spoken aloud by TTS
- Give complete, thorough responses — NEVER cut short
- NEVER use bullet points, lists, markdown, formatting, emojis, URLs`,
}

const DEFAULT_PERSONALITY = "bestfriend"

/* ═══════════════════════════════════════════════
   EXTRACT ALL TEXT FROM GEMINI RESPONSE
   Handles both regular and grounded responses
   where parts[] can contain text, functionCall,
   functionResponse, etc.
   ═══════════════════════════════════════════════ */

function extractTextFromResponse(data: any): string {
  try {
    const candidates = data.candidates
    if (!candidates || candidates.length === 0) return ""

    const candidate = candidates[0]
    const content = candidate.content
    if (!content || !content.parts) return ""

    // Collect text from ALL parts (some might be tool calls, skip those)
    let fullText = ""
    for (const part of content.parts) {
      if (part.text) {
        fullText += part.text
      }
    }

    return fullText.trim()
  } catch {
    return ""
  }
}

/* ═══════════════════════════════════════════════
   GEMINI API HANDLER
   Using non-streaming generateContent for
   reliability with Google Search grounding.
   Streaming + tools causes broken/partial
   responses — non-streaming is rock solid.
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

    // ════════════════════════════════════════════
    // NON-STREAMING endpoint (no "stream" in URL)
    // This is more reliable with tools/grounding
    // ════════════════════════════════════════════
    const model = "gemini-2.5-flash"
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
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
      console.error("Empty Gemini response:", JSON.stringify(data).slice(0, 500))
      return new Response(JSON.stringify({ error: "Empty response from AI" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    // ════════════════════════════════════════════
    // Send back as SSE so the frontend code
    // doesn't need any changes — it still reads
    // SSE events the same way. We just send the
    // full text in chunks to simulate streaming.
    // ════════════════════════════════════════════
    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      start(controller) {
        // Split into chunks of ~100 chars to simulate streaming
        // This makes TTS start faster since the frontend
        // can begin processing before the full text arrives
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