import { NextRequest, NextResponse } from "next/server"
import { textToSpeech } from "@/services/voice.service"

export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const { text } = await req.json()

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { success: false, error: "text is required" },
        { status: 400 }
      )
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    const voiceId = process.env.ELEVENLABS_VOICE_ID

    if (!apiKey || !voiceId) {
      return NextResponse.json(
        { success: false, error: "ElevenLabs not configured" },
        { status: 500 }
      )
    }

    const audioData = await textToSpeech({ text, voiceId, apiKey })

    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-cache",
      },
    })
  } catch (err) {
    console.error("TTS route error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
