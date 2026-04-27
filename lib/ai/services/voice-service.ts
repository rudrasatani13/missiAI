import { vertexGeminiGenerate } from "@/lib/ai/providers/vertex-client"
import type { STTResult } from "@/types"

const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview"
const GEMINI_STT_MODEL = "gemini-3-flash-preview"
const GEMINI_TTS_SAMPLE_RATE = 24000

function decodeBase64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function encodeBytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function extractGeminiText(result: {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
  }>
}): string {
  return result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? ""
}

function encodePcmAsWav(pcmBytes: Uint8Array, sampleRate: number = GEMINI_TTS_SAMPLE_RATE): ArrayBuffer {
  const wavBuffer = new ArrayBuffer(44 + pcmBytes.byteLength)
  const view = new DataView(wavBuffer)
  const bytes = new Uint8Array(wavBuffer)

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i))
    }
  }

  writeString(0, "RIFF")
  view.setUint32(4, 36 + pcmBytes.byteLength, true)
  writeString(8, "WAVE")
  writeString(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeString(36, "data")
  view.setUint32(40, pcmBytes.byteLength, true)
  bytes.set(pcmBytes, 44)

  return wavBuffer
}

export async function geminiTextToSpeech(options: {
  text: string
  voiceName?: string
  prompt?: string
}): Promise<ArrayBuffer> {
  const prompt = options.prompt?.trim() || options.text.trim()
  const res = await vertexGeminiGenerate(GEMINI_TTS_MODEL, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: options.voiceName || "Kore",
          },
        },
      },
    },
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)")
    const err = new Error(`Gemini TTS error ${res.status}: ${errText}`)
    ;(err as any).status = res.status
    throw err
  }

  const result = await res.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: {
            data?: string
          }
        }>
      }
    }>
  }

  const audioBase64 = result.candidates?.[0]?.content?.parts?.find((part) => typeof part.inlineData?.data === "string")?.inlineData?.data
  if (!audioBase64) {
    throw new Error("Gemini TTS returned no audio data")
  }

  return encodePcmAsWav(decodeBase64ToBytes(audioBase64))
}

// ─── STT ──────────────────────────────────────────────────────────────────────

export async function geminiSpeechToText(options: {
  audio: File | Blob
}): Promise<STTResult> {
  const { audio } = options
  const audioBuffer = await audio.arrayBuffer()
  const mimeType = (audio.type || "audio/webm").split(";")[0] || "audio/webm"
  const audioBase64 = encodeBytesToBase64(new Uint8Array(audioBuffer))
  const res = await vertexGeminiGenerate(GEMINI_STT_MODEL, {
    contents: [{
      role: "user",
      parts: [
        {
          text: "Transcribe this spoken audio recording. Return only valid JSON with keys \"text\" and \"language\". Use an ISO-like language code such as en, hi, or hi-Latn when you can infer it. If there is no intelligible speech, return {\"text\":\"\",\"language\":\"auto\"}.",
        },
        {
          inlineData: {
            mimeType,
            data: audioBase64,
          },
        },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
    },
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => "(no body)")
    const err = new Error(`Gemini STT error ${res.status}: ${errText}`)
    ;(err as any).status = res.status
    ;(err as any).detail = errText
    throw err
  }

  const result = await res.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string
        }>
      }
    }>
  }

  const responseText = extractGeminiText(result)
  if (!responseText) {
    throw new Error("Gemini STT returned no transcription data")
  }

  let parsed: { text?: unknown; language?: unknown }
  try {
    parsed = JSON.parse(responseText) as { text?: unknown; language?: unknown }
  } catch {
    throw new Error(`Gemini STT returned invalid JSON: ${responseText}`)
  }

  return {
    text: typeof parsed.text === "string" ? parsed.text : "",
    language: typeof parsed.language === "string" ? parsed.language : "auto",
    confidence: 0,
  }
}

