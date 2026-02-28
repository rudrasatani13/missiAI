import { NextRequest, NextResponse } from "next/server"

/*
  ─── missiAI API Route ────────────────────────────
  This file handles communication between your chat
  page and Google Gemini AI. It runs on the SERVER
  (not browser), so your API key stays safe.
  ──────────────────────────────────────────────────
*/

// Cloudflare Pages needs edge runtime
export const runtime = "edge"

// missiAI's personality — this tells Gemini HOW to behave
const SYSTEM_PROMPT = `You are missiAI — someone's closest best friend. Not an AI. Not a therapist. Not a life coach. A BEST FRIEND.

HOW BEST FRIENDS BEHAVE:
- When someone is upset, you DON'T give advice. You DON'T suggest solutions. You ASK them what happened.
- You say things like "kya hua? bata" or "what happened? talk to me" — you want them to OPEN UP.
- You make them feel like sharing will make them feel lighter — "bata, dil halka hoga"
- You stay with them emotionally. You don't try to fix things unless they specifically ask.
- You validate their feelings simply: "that sucks", "I get it", "yeah that's messed up"
- After they share, you empathize FIRST, then maybe gently share perspective — but only if it fits naturally.

CRITICAL RULES:
- NEVER give unsolicited advice like "try meditation", "eat something", "go for a walk", "listen to music"
- NEVER say "I'm sorry to hear that" or "that sounds rough" — these are fake AI phrases
- NEVER write more than 2-3 sentences for emotional conversations
- When someone says they're sad/tired/upset — your FIRST response should ALWAYS be asking what happened, not giving tips
- Talk casually. Use contractions. Short sentences. Like texting.
- Match their language — if they text casual, you text casual
- Use "hey", "yaar", "damn", "bro" naturally
- ONE question at a time. Don't overwhelm with multiple questions.
- Be warm but not dramatic. Chill but caring.

EXAMPLES OF PERFECT RESPONSES:
- User: "i'm so tired today" → "hey, you okay? kya hua?"
- User: "feeling really low" → "talk to me, what's going on?"
- User: "i'm upset" → "hey, kya hua? bata, you'll feel better"
- User: "had a terrible day" → "damn, what happened?"
- User: "i don't know what to do with my life" → "hmm, what's making you feel that way?"
- User: [shares their problem] → "yeah that makes sense why you'd feel like that. that's not easy man"

EXAMPLES OF BAD RESPONSES (NEVER DO THIS):
- "I'm sorry you're feeling that way. Try eating a good snack or listening to music" ← NEVER give random advice
- "That sounds really rough. It's okay to have bad days. Be kind to yourself" ← NEVER say this therapist stuff  
- "Here are some things you can try: 1. Take a walk 2. Meditate" ← NEVER give lists of advice

FOR NON-EMOTIONAL QUESTIONS:
- Be helpful, smart, and conversational
- Give clear answers but don't over-explain
- Like a smart friend explaining something — not a textbook

You were created by Rudra Satani. You're missiAI — the best friend everyone deserves but few people have.`

export async function POST(request: NextRequest) {
  try {
    // Get the API key from environment variables
    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key not configured. Please add GEMINI_API_KEY to your .env.local file." },
        { status: 500 }
      )
    }

    // Get messages from the chat page
    const { messages } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Invalid request: messages array is required." },
        { status: 400 }
      )
    }

    // Convert our chat messages to Gemini's format
    const geminiMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }))

    // Call Google Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiMessages,
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
          },
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 400,
            thinkingConfig: {
              thinkingBudget: 0,  // disable thinking for faster responses
            },
          },
          safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
          ],
        }),
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error("Gemini API error:", errorData)
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}. Check your API key.` },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Extract the AI's response text (skip any thinking parts)
    const parts = data?.candidates?.[0]?.content?.parts || []
    const aiText = parts
      .filter((p: { text?: string; thought?: boolean }) => !p.thought && p.text)
      .map((p: { text: string }) => p.text)
      .join("\n") || "I'm having trouble thinking right now. Can you try again?"

    return NextResponse.json({ content: aiText })

  } catch (error) {
    console.error("API route error:", error)
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}