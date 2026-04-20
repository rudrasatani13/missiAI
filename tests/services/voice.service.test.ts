import { describe, it, expect, vi, beforeEach } from "vitest"
import { speechToText, textToSpeech } from "@/services/voice.service"

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as any

describe("voice.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("speechToText", () => {
    it("should successfully convert speech to text", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          text: "Hello world",
          language_code: "en",
          language_probability: 0.99,
        }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const fakeAudio = new Blob(["fake-audio-data"], { type: "audio/webm" })
      const result = await speechToText({
        audio: fakeAudio,
        apiKey: "test-api-key",
      })

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.elevenlabs.io/v1/speech-to-text",
        expect.objectContaining({
          method: "POST",
          headers: { "xi-api-key": "test-api-key" },
        })
      )

      const callArgs = mockFetch.mock.calls[0][1]
      expect(callArgs.body).toBeInstanceOf(FormData)
      const formData = callArgs.body as FormData
      expect(formData.get("model_id")).toBe("scribe_v2")
      expect(formData.get("tag_audio_events")).toBe("false")

      const fileEntry = formData.get("file") as Blob | null
      expect(fileEntry).toBeInstanceOf(Blob)
      expect(fileEntry?.type).toBe("audio/webm")

      expect(result).toEqual({
        text: "Hello world",
        language: "en",
        confidence: 0.99,
      })
    })

    it("should handle missing properties in successful response", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({}), // Empty object
      }
      mockFetch.mockResolvedValue(mockResponse)

      const fakeAudio = new Blob(["fake-audio-data"], { type: "audio/webm" })
      const result = await speechToText({
        audio: fakeAudio,
        apiKey: "test-api-key",
      })

      expect(result).toEqual({
        text: "",
        language: "auto",
        confidence: 0,
      })
    })

    it("should handle audio without type by defaulting to audio/webm", async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          text: "fallback test",
        }),
      }
      mockFetch.mockResolvedValue(mockResponse)

      // A File object, but missing the type property
      const fakeAudio = new Blob(["fake-audio-data"]) as any
      fakeAudio.name = "custom.wav"

      await speechToText({
        audio: fakeAudio,
        apiKey: "test-api-key",
      })

      const callArgs = mockFetch.mock.calls[0][1]
      const formData = callArgs.body as FormData
      const fileEntry = formData.get("file") as Blob
      expect(fileEntry.type).toBe("audio/webm")
    })

    it("should throw an error with status and detail on API failure", async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue("Bad Request from ElevenLabs"),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const fakeAudio = new Blob(["fake-audio-data"], { type: "audio/webm" })

      let caughtError: any
      try {
        await speechToText({
          audio: fakeAudio,
          apiKey: "test-api-key",
        })
      } catch (err) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      expect(caughtError.message).toContain("ElevenLabs STT error 400: Bad Request from ElevenLabs")
      expect(caughtError.status).toBe(400)
      expect(caughtError.detail).toBe("Bad Request from ElevenLabs")
    })

    it("should handle API failure where text() throws", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockRejectedValue(new Error("Network error")),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const fakeAudio = new Blob(["fake-audio-data"], { type: "audio/webm" })

      let caughtError: any
      try {
        await speechToText({
          audio: fakeAudio,
          apiKey: "test-api-key",
        })
      } catch (err) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      expect(caughtError.message).toContain("ElevenLabs STT error 500: (no body)")
      expect(caughtError.status).toBe(500)
      expect(caughtError.detail).toBe("(no body)")
    })
  })

  describe("textToSpeech", () => {
    it("should successfully convert text to speech", async () => {
      const mockArrayBuffer = new ArrayBuffer(8)
      const mockResponse = {
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
      }
      mockFetch.mockResolvedValue(mockResponse)

      const result = await textToSpeech({
        text: "Hello world",
        voiceId: "test-voice-id",
        apiKey: "test-api-key",
      })

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.elevenlabs.io/v1/text-to-speech/test-voice-id",
        expect.objectContaining({
          method: "POST",
          headers: {
            "xi-api-key": "test-api-key",
            "Content-Type": "application/json",
            Accept: "audio/mpeg",
          },
        })
      )

      const callArgs = mockFetch.mock.calls[0][1]
      const body = JSON.parse(callArgs.body)
      expect(body.text).toBe("Hello world")
      expect(body.model_id).toBe("eleven_turbo_v2_5")
      expect(body.voice_settings).toEqual({
        stability: 0.82,
        similarity_boost: 0.8,
        style: 0.05,
        use_speaker_boost: true,
        speed: 1.05,
      })

      expect(result).toBe(mockArrayBuffer)
    })

    it("should throw an error with status on API failure", async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue("Unauthorized"),
      }
      mockFetch.mockResolvedValue(mockResponse)

      let caughtError: any
      try {
        await textToSpeech({
          text: "Hello world",
          voiceId: "test-voice-id",
          apiKey: "test-api-key",
        })
      } catch (err) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      expect(caughtError.message).toContain("ElevenLabs TTS error 401: Unauthorized")
      expect(caughtError.status).toBe(401)
    })

    it("should handle TTS API failure where text() throws", async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        text: vi.fn().mockRejectedValue(new Error("Network error")),
      }
      mockFetch.mockResolvedValue(mockResponse)

      let caughtError: any
      try {
        await textToSpeech({
          text: "Hello world",
          voiceId: "test-voice-id",
          apiKey: "test-api-key",
        })
      } catch (err) {
        caughtError = err
      }

      expect(caughtError).toBeDefined()
      expect(caughtError.message).toContain("ElevenLabs TTS error 500: (no body)")
      expect(caughtError.status).toBe(500)
    })
  })
})
