import { NextRequest } from "next/server"

export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get("audio") as File | null

    if (!audioFile) {
      return new Response(JSON.stringify({ error: "No audio file" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing ElevenLabs API key" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })
    }

    const elevenLabsForm = new FormData()
    elevenLabsForm.append("file", audioFile)
    elevenLabsForm.append("model_id", "scribe_v2")

    // ════════════════════════════════════════════════
    // KEY FIX #1: Force Hindi language detection
    // Without this, ElevenLabs defaults to English
    // and garbles all Hindi speech
    // ════════════════════════════════════════════════
    elevenLabsForm.append("language_code", "hin")

    // ════════════════════════════════════════════════
    // KEY FIX #2: Keyterms — bias model towards
    // common Hinglish words for better accuracy
    // ════════════════════════════════════════════════
    const hinglishKeyterms = [
      "kya", "hai", "nahi", "haan", "yaar", "arre",
      "acha", "accha", "theek", "matlab", "samajh",
      "batao", "bata", "sunao", "dekho", "chalo",
      "kaise", "kaha", "kab", "kyun", "kaun",
      "mujhe", "tujhe", "humein", "tumhe",
      "karo", "karna", "chahiye", "sakta", "sakti",
      "bahut", "thoda", "zyada", "kam", "abhi",
      "pehle", "baad", "phir", "fir", "lekin",
      "aur", "ya", "par", "toh", "woh", "yeh",
      "kuch", "sab", "bohot", "bilkul",
      "paisa", "kaam", "ghar", "dost",
      "missi", "missiAI",
    ]
    for (const term of hinglishKeyterms) {
      elevenLabsForm.append("keyterms", term)
    }

    elevenLabsForm.append("tag_audio_events", "false")

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: elevenLabsForm,
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error("ElevenLabs STT error:", response.status, errText)
      return new Response(JSON.stringify({ error: "Transcription failed", details: errText }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      })
    }

    const result = await response.json()

    return new Response(
      JSON.stringify({
        text: result.text || "",
        language: result.language_code || "hin",
        confidence: result.language_probability || 0,
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("STT route error:", err)
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    })
  }
}