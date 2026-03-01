import { NextRequest, NextResponse } from "next/server"

export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY

    if (!apiKey) {
      return NextResponse.json({ error: "ElevenLabs not configured" }, { status: 500 })
    }

    // Get the audio from the request
    const formData = await req.formData()
    const audioFile = formData.get("audio") as File | null

    if (!audioFile) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 })
    }

    // Forward to ElevenLabs STT API
    const elevenLabsForm = new FormData()
    elevenLabsForm.append("file", audioFile, "audio.webm")
    elevenLabsForm.append("model_id", "scribe_v1")
    elevenLabsForm.append("language_code", "en")

    const response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
      },
      body: elevenLabsForm,
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error("ElevenLabs STT error:", errText)
      return NextResponse.json(
        { error: "Speech-to-text failed" },
        { status: response.status }
      )
    }

    const result = await response.json()

    return NextResponse.json({
      text: result.text || "",
      language: result.language_code || "en",
    })
  } catch (err) {
    console.error("STT route error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}