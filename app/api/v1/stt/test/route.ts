// TEMPORARY diagnostic endpoint — DELETE after debugging
// GET /api/v1/stt/test — tests ElevenLabs STT from the edge runtime
// Returns exact error details visible in browser

import { getEnv } from "@/lib/server/env"

export const runtime = "edge"

export async function GET() {
  const results: Record<string, unknown> = { timestamp: Date.now() }

  // 1. Check env
  try {
    const env = getEnv()
    results.apiKeyPresent = !!env.ELEVENLABS_API_KEY
    results.apiKeyLength = env.ELEVENLABS_API_KEY?.length ?? 0
    results.apiKeyPrefix = env.ELEVENLABS_API_KEY?.slice(0, 4) + "..."
  } catch (e) {
    results.envError = (e as Error).message
    return Response.json(results, { status: 500 })
  }

  // 2. Generate a minimal valid WAV file (100ms of silence, 16kHz mono PCM)
  const sampleRate = 16000
  const numSamples = sampleRate / 10 // 100ms = 1600 samples
  const byteRate = sampleRate * 2
  const dataSize = numSamples * 2
  const headerSize = 44
  const buffer = new ArrayBuffer(headerSize + dataSize)
  const view = new DataView(buffer)

  // WAV header
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
  }
  writeString(0, "RIFF")
  view.setUint32(4, 36 + dataSize, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true) // PCM
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, "data")
  view.setUint32(40, dataSize, true)
  // Data is already zeros (silence)

  results.testAudioSize = buffer.byteLength

  // 3. Send to ElevenLabs
  try {
    const blob = new Blob([buffer], { type: "audio/wav" })
    const form = new FormData()
    form.append("file", blob, "test.wav")
    form.append("model_id", "scribe_v2")
    form.append("tag_audio_events", "false")

    const env = getEnv()
    const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
      body: form,
    })

    results.elevenLabsStatus = res.status
    results.elevenLabsStatusText = res.statusText
    results.elevenLabsHeaders = Object.fromEntries(res.headers.entries())

    if (!res.ok) {
      const errBody = await res.text().catch(() => "(could not read body)")
      results.elevenLabsError = errBody
      return Response.json(results, { status: 200 }) // Return 200 so we can read the diagnostic
    }

    const data = await res.json()
    results.elevenLabsResponse = data
    results.success = true
  } catch (e) {
    results.fetchError = (e as Error).message
    results.fetchStack = (e as Error).stack
  }

  return Response.json(results, { status: 200 })
}
