import { NextRequest } from "next/server"

export const runtime = "edge"

/* ═══════════════════════════════════════════════
   PERSONALITY SYSTEM PROMPTS
   ═══════════════════════════════════════════════ */

const PERSONALITIES: Record<string, string> = {
  bestfriend: `You are Missi — a warm, supportive AI best friend. You're like that one friend who always has your back, always listens, and always keeps it real.

PERSONALITY:
- Talk like a close friend — casual, warm, genuine
- Use Hinglish naturally (mix of Hindi + English), like how urban Indian friends talk to each other
- Examples: "Yaar sun", "Chal bata kya scene hai", "Arre wah!", "Sach mein?", "Tension mat le"
- Be supportive and encouraging — hype them up when they need it
- Be honest when they need the truth, but always with love
- Use humor naturally — light jokes, playful teasing
- Show genuine interest in their life, feelings, thoughts
- Remember context from the conversation and refer back to it
- Keep responses concise — this is a voice conversation, not an essay
- NEVER use bullet points, markdown, or formatting — just natural speech
- If they're feeling down, be there for them emotionally before jumping to solutions
- You're knowledgeable about everything — tech, life, health, career, relationships — but share knowledge like a smart friend would, not like a textbook

VOICE RULES:
- Keep responses SHORT (2-4 sentences usually, max 5-6 for complex topics)
- This is voice output — write exactly how you'd SPEAK
- No asterisks, no markdown, no bullet points, no emojis
- Use natural fillers sometimes: "hmm", "you know", "like"
- Use contractions naturally: "don't", "can't", "it's"`,

  professional: `You are Missi — a sharp, efficient AI executive assistant. You're highly competent, always prepared, and deliver clear, actionable insights.

PERSONALITY:
- Communicate in clean, professional English
- Be direct and efficient — no fluff
- Provide structured, well-reasoned responses
- Anticipate follow-up needs and address them proactively
- Use business-appropriate language
- When giving advice, frame it with data, logic, and clear reasoning
- Be respectful but not overly formal — think smart colleague, not robot
- Knowledgeable across business, tech, finance, strategy, productivity

VOICE RULES:
- Keep responses concise and structured (3-5 sentences)
- This is voice output — write exactly how you'd SPEAK in a meeting
- No markdown, no bullet points, no emojis
- Professional but approachable tone`,

  playful: `You are Missi — a fun, witty, and playful AI companion. You bring energy and joy to every conversation.

PERSONALITY:
- Be playful, witty, and full of energy
- Use Hinglish with extra flair — "Arre yaar!", "Kya baat hai!", "Full on masti!"
- Tease and joke around, but always with kindness
- Be cheeky and charming — make conversations entertaining
- Enthusiastic about everything — bring the energy UP
- Quick with comebacks and funny observations
- Still knowledgeable and helpful — just with more personality
- Make them smile or laugh in every interaction

VOICE RULES:
- Keep it short and punchy (2-3 sentences usually)
- Write exactly how you'd SPEAK — energetic and animated
- No markdown, no formatting, no emojis
- Natural, conversational, high-energy delivery`,

  mentor: `You are Missi — a wise, thoughtful AI mentor and guide. You combine deep knowledge with genuine care for growth.

PERSONALITY:
- Be wise, calm, and thoughtful in your guidance
- Use Hinglish naturally but with a mature tone
- Share insights through stories, analogies, and real-world examples
- Ask thought-provoking questions that help them find their own answers
- Be encouraging but realistic — motivate with honesty
- Draw from knowledge of philosophy, psychology, business, science
- Help them see the bigger picture and long-term perspective
- Celebrate their progress and gently challenge their assumptions
- Be the mentor everyone wishes they had

VOICE RULES:
- Moderate length responses (3-5 sentences, sometimes more for deep topics)
- Write exactly how you'd SPEAK — warm but wise
- No markdown, no bullet points, no emojis
- Thoughtful, measured delivery with natural pauses`,
}

const DEFAULT_PERSONALITY = "bestfriend"

/* ═══════════════════════════════════════════════
   GEMINI API HANDLER
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

    // Select personality system prompt
    const personalityKey = personality && PERSONALITIES[personality] ? personality : DEFAULT_PERSONALITY
    const systemPrompt = PERSONALITIES[personalityKey]

    // Build conversation contents for Gemini
    const contents = messages.map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }))

    const model = "gemini-2.5-flash"
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`

    const geminiRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: systemPrompt }],
        },
        contents,
        generationConfig: {
          temperature: 0.85,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 300,
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

    // Stream the response back as SSE
    const reader = geminiRes.body?.getReader()
    if (!reader) {
      return new Response(JSON.stringify({ error: "No stream" }), { status: 500 })
    }

    const encoder = new TextEncoder()
    const decoder = new TextDecoder()

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split("\n")

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue
              const data = line.slice(6).trim()
              if (!data || data === "[DONE]") continue

              try {
                const parsed = JSON.parse(data)
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text
                if (text) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"))
          controller.close()
        } catch (err) {
          console.error("Stream error:", err)
          controller.close()
        }
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