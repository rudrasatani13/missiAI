import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest"
import { textToSpeech, speechToText } from "@/services/voice.service"
import type { TTSOptions, STTOptions } from "@/types"

const TTS_ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech"
const STT_ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text"

describe("Voice Service", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("textToSpeech", () => {
    const defaultOptions: TTSOptions = {
      text: "Hello world",
      voiceId: "test-voice-id",
      apiKey: "test-api-key",
    }

    it("should successfully convert text to speech with default options", async () => {
      const mockArrayBuffer = new ArrayBuffer(8)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
      })

      const result = await textToSpeech(defaultOptions)

      expect(result).toBe(mockArrayBuffer)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledWith(`${TTS_ENDPOINT}/test-voice-id`, {
        method: "POST",
        headers: {
          "xi-api-key": "test-api-key",
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: "Hello world",
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.82,
            similarity_boost: 0.8,
            style: 0.05,
            use_speaker_boost: true,
            speed: 1.05,
          },
        }),
      })
    })

    it("should truncate text if it exceeds 4000 characters", async () => {
      const longText = "a".repeat(5000)
      const options = { ...defaultOptions, text: longText }

      const mockArrayBuffer = new ArrayBuffer(8)
      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(mockArrayBuffer),
      })

      await textToSpeech(options)

      const callArgs = fetchMock.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)
      expect(body.text).toHaveLength(4000)
      expect(body.text).toBe("a".repeat(4000))
    })

    it("should use custom options when provided", async () => {
      const customOptions: TTSOptions = {
        ...defaultOptions,
        modelId: "custom_model",
        stability: 0.9,
        similarityBoost: 0.7,
        style: 0.1,
        speed: 1.2,
      }

      fetchMock.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
      })

      await textToSpeech(customOptions)

      const callArgs = fetchMock.mock.calls[0]
      const body = JSON.parse(callArgs[1].body)

      expect(body.model_id).toBe("custom_model")
      expect(body.voice_settings.stability).toBe(0.9)
      expect(body.voice_settings.similarity_boost).toBe(0.7)
      expect(body.voice_settings.style).toBe(0.1)
      expect(body.voice_settings.speed).toBe(1.2)
    })

    it("should throw an error with text message on non-200 response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue("Unauthorized access"),
      })

      await expect(textToSpeech(defaultOptions)).rejects.toThrow(
        "ElevenLabs TTS error 401: Unauthorized access"
      )
    })

    it("should handle error when error body is unreadable", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockRejectedValue(new Error("Cannot read body")),
      })

      await expect(textToSpeech(defaultOptions)).rejects.toThrow(
        "ElevenLabs TTS error 500: (no body)"
      )
    })
  })

  describe("speechToText", () => {
    let mockFile: File;

    beforeEach(() => {
      mockFile = new File(["dummy audio content"], "test-audio.webm", {
        type: "audio/webm",
      })
    })

    const getOptions = (audio: Blob): STTOptions => ({
      audio,
      apiKey: "test-api-key",
    })

    it("should successfully convert speech to text", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          text: "Hello from speech",
          language_code: "en",
          language_probability: 0.98,
        }),
      })

      const result = await speechToText(getOptions(mockFile))

      expect(result).toEqual({
        text: "Hello from speech",
        language: "en",
        confidence: 0.98,
      })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const callArgs = fetchMock.mock.calls[0]
      expect(callArgs[0]).toBe(STT_ENDPOINT)
      expect(callArgs[1].method).toBe("POST")
      expect(callArgs[1].headers).toEqual({
        "xi-api-key": "test-api-key",
      })

      const formData = callArgs[1].body as FormData
      expect(formData.get("model_id")).toBe("scribe_v2")
      expect(formData.get("tag_audio_events")).toBe("false")
      const fileInForm = formData.get("file") as File
      expect(fileInForm).toBeDefined()
      expect(fileInForm.name).toBe("test-audio.webm")
      expect(fileInForm.type).toBe("audio/webm")
    })

    it("should handle missing optional properties in API response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          text: "Hello",
        }),
      })

      const result = await speechToText(getOptions(mockFile))

      expect(result).toEqual({
        text: "Hello",
        language: "auto",
        confidence: 0,
      })
    })

    it("should throw an error with details on non-200 response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue("Bad Request"),
      })

      await expect(speechToText(getOptions(mockFile))).rejects.toThrow(
        "ElevenLabs STT error 400: Bad Request"
      )
    })

    it("should use fallback mimeType and fileName if Blob is passed instead of File", async () => {
      const mockBlob = new Blob(["dummy audio content"])

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          text: "Blob text",
        }),
      })

      await speechToText(getOptions(mockBlob))

      const callArgs = fetchMock.mock.calls[0]
      const formData = callArgs[1].body as FormData
      const fileInForm = formData.get("file") as File
      expect(fileInForm.name).toBe("recording.webm")
      expect(fileInForm.type).toBe("audio/webm")
    })

    it("should handle error when error body is unreadable in speechToText", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockRejectedValue(new Error("Cannot read body")),
      })

      await expect(speechToText(getOptions(mockFile))).rejects.toThrow(
        "ElevenLabs STT error 500: (no body)"
      )
    })
  })
})
