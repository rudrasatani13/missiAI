import type { TTSOptions, STTOptions, STTResult } from "@/types"

const TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech"
const STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text"
const MAX_TTS_CHARS = 4000

// ─── Default Hinglish keyterms ────────────────────────────────────────────────
// Biases ElevenLabs STT model towards common Hindi/Hinglish words for accuracy

const HINGLISH_KEYTERMS: string[] = [
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

// ─── TTS ──────────────────────────────────────────────────────────────────────

export async function textToSpeech(options: TTSOptions): Promise<ArrayBuffer> {
  const {
    text,
    voiceId,
    apiKey,
    modelId = "eleven_turbo_v2_5",
    stability = 0.5,
    similarityBoost = 0.75,
    style = 0.3,
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
      },
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ElevenLabs TTS error ${res.status}: ${errText}`)
  }

  return res.arrayBuffer()
}

// ─── STT ──────────────────────────────────────────────────────────────────────

export async function speechToText(options: STTOptions): Promise<STTResult> {
  const {
    audio,
    apiKey,
    keyterms = HINGLISH_KEYTERMS,
  } = options

  const form = new FormData()
  form.append("file", audio)
  form.append("model_id", "scribe_v2")
  // Let Scribe auto-detect language — supports Hindi, English, and Hinglish
  for (const term of keyterms) {
    form.append("keyterms", term)
  }
  form.append("tag_audio_events", "false")

  const res = await fetch(STT_ENDPOINT, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`ElevenLabs STT error ${res.status}: ${errText}`)
  }

  const result = await res.json()
  return {
    text: (result.text as string) ?? "",
    language: (result.language_code as string) ?? "auto",
    confidence: (result.language_probability as number) ?? 0,
  }
}
