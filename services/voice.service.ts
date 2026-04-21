import type { TTSOptions, STTOptions, STTResult } from "@/types"

const TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech"
const STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text"
const MAX_TTS_CHARS = 4000

// ─── TTS ──────────────────────────────────────────────────────────────────────

export async function textToSpeech(options: TTSOptions): Promise<ArrayBuffer> {
  const {
    text,
    voiceId,
    apiKey,
    modelId = "eleven_turbo_v2_5",
    stability = 0.82,
    similarityBoost = 0.8,
    style = 0.05,
    speed = 1.05,
  } = options

  const res = await fetch(`${TTS_ENDPOINT}/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.slice(0, MAX_TTS_CHARS),
      model_id: modelId,
      voice_settings: {
        stability,
        similarity_boost: similarityBoost,
        style,
        use_speaker_boost: true,
        speed,
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)")
    const err = new Error(`ElevenLabs TTS error ${res.status}: ${errText}`)
    ;(err as any).status = res.status
    throw err
  }

  return res.arrayBuffer()
}

// ─── STT ──────────────────────────────────────────────────────────────────────

export async function speechToText(options: STTOptions): Promise<STTResult> {
  const { audio, apiKey } = options

  // CRITICAL: On Cloudflare Workers edge runtime, the File object received
  // from the incoming request's FormData can have a non-replayable body stream.
  // We MUST read the file into memory first, then create a fresh Blob for the
  // outgoing request. Without this, ElevenLabs receives an empty/corrupt file
  // and returns 500. This works fine on Node.js (localhost) because Node's File
  // implementation buffers data in memory.
  const audioBuffer = await audio.arrayBuffer()
  const mimeType = audio.type || "audio/webm"
  const fileName = (audio as File).name || "recording.webm"
  const freshBlob = new Blob([audioBuffer], { type: mimeType })

  const form = new FormData()
  form.append("file", freshBlob, fileName)
  form.append("model_id", "scribe_v2")
  // Omit language_code — scribe_v2 auto-detects language
  // Omit keyterms — optional, adds 20% cost surcharge, and format varies
  // between edge runtimes. Scribe_v2 handles Hindi/Hinglish well without them.
  form.append("tag_audio_events", "false")

  const res = await fetch(STT_ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)")
    const err = new Error(`ElevenLabs STT error ${res.status}: ${errText}`)
    ;(err as any).status = res.status
    ;(err as any).detail = errText
    throw err
  }

  const result = await res.json()
  return {
    text: (result.text as string) ?? "",
    language: (result.language_code as string) ?? "auto",
    confidence: (result.language_probability as number) ?? 0,
  }
}

