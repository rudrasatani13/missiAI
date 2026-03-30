import { NextRequest } from "next/server"
import { speechToText } from "@/services/voice.service"

export const runtime = "edge"

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioFile = formData.get("audio") as File | null

    if (!audioFile) {
      return new Response(
        JSON.stringify({ success: false, error: "No audio file provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ElevenLabs API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      )
    }

    const result = await speechToText({ audio: audioFile, apiKey })

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("STT route error:", err)
    const message = err instanceof Error ? err.message : "Internal server error"
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}
