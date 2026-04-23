import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/ai/vertex-client", () => ({
  geminiGenerate: vi.fn(),
}))

import { geminiGenerate } from "@/lib/ai/vertex-client"
import { geminiSpeechToText, geminiTextToSpeech } from "@/services/voice.service"

describe("Voice Service", () => {
  const geminiGenerateMock = vi.mocked(geminiGenerate)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("geminiTextToSpeech", () => {
    it("wraps Gemini PCM output as a WAV buffer", async () => {
      const pcmBytes = new Uint8Array([0, 0, 255, 127])
      const audioBase64 = Buffer.from(pcmBytes).toString("base64")

      geminiGenerateMock.mockResolvedValueOnce(
        new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ inlineData: { data: audioBase64 } }],
            },
          }],
        }), { status: 200 }),
      )

      const result = await geminiTextToSpeech({ text: "Hello world", voiceName: "Kore" })
      const bytes = new Uint8Array(result)

      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("RIFF")
      expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe("WAVE")
      expect(geminiGenerateMock).toHaveBeenCalledTimes(1)
      expect(geminiGenerateMock.mock.calls[0][0]).toBe("gemini-3.1-flash-tts-preview")
      expect((geminiGenerateMock.mock.calls[0][1] as any).contents[0].role).toBe("user")
      expect((geminiGenerateMock.mock.calls[0][1] as any).generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe("Kore")
      expect((geminiGenerateMock.mock.calls[0][1] as any).generationConfig.responseModalities).toEqual(["AUDIO"])
    })

    it("throws when Gemini returns no audio data", async () => {
      geminiGenerateMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ candidates: [{ content: { parts: [{}] } }] }), { status: 200 }),
      )

      await expect(geminiTextToSpeech({ text: "Hello world" })).rejects.toThrow(
        "Gemini TTS returned no audio data",
      )
    })
  })

  describe("geminiSpeechToText", () => {
    it("transcribes audio and returns text plus language", async () => {
      geminiGenerateMock.mockResolvedValueOnce(
        new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: '{"text":"Hello from speech","language":"en"}' }],
            },
          }],
        }), { status: 200 }),
      )

      const file = new File(["dummy audio content"], "test-audio.webm", {
        type: "audio/webm",
      })

      const result = await geminiSpeechToText({ audio: file })

      expect(result).toEqual({
        text: "Hello from speech",
        language: "en",
        confidence: 0,
      })
      expect(geminiGenerateMock).toHaveBeenCalledTimes(1)
      expect(geminiGenerateMock.mock.calls[0][0]).toBe("gemini-3-flash-preview")
      expect((geminiGenerateMock.mock.calls[0][1] as any).contents[0].parts[1].inlineData.mimeType).toBe("audio/webm")
      expect(typeof (geminiGenerateMock.mock.calls[0][1] as any).contents[0].parts[1].inlineData.data).toBe("string")
    })

    it("falls back to auto language when Gemini omits it", async () => {
      geminiGenerateMock.mockResolvedValueOnce(
        new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: '{"text":"Hello"}' }],
            },
          }],
        }), { status: 200 }),
      )

      const result = await geminiSpeechToText({ audio: new Blob(["dummy audio content"], { type: "audio/ogg" }) })

      expect(result).toEqual({
        text: "Hello",
        language: "auto",
        confidence: 0,
      })
    })

    it("throws when Gemini returns invalid JSON", async () => {
      geminiGenerateMock.mockResolvedValueOnce(
        new Response(JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: "not-json" }],
            },
          }],
        }), { status: 200 }),
      )

      await expect(
        geminiSpeechToText({ audio: new Blob(["dummy audio content"], { type: "audio/webm" }) }),
      ).rejects.toThrow("Gemini STT returned invalid JSON: not-json")
    })
  })
})
