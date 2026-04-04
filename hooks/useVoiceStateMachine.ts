"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  fetchWithTimeout,
  STREAM_CHAT_TIMEOUT,
  TTS_TIMEOUT,
  STT_TIMEOUT,
} from "@/lib/client/fetch-with-timeout"
import { getBestAudioMimeType } from "@/lib/client/browser-support"
import { shouldUseTTS, truncateForTTS } from "@/lib/ai/tts-optimizer"
import { AudioQueue } from "@/lib/client/audio-queue"
import type { VoiceState, ConversationEntry, PersonalityKey } from "@/types/chat"
import { useEmotionDetector } from "@/hooks/useEmotionDetector"
import type { EmotionAdaptation } from "@/types/emotion"

export type { VoiceState }

export interface UseVoiceStateMachineOptions {
  userId?: string
  personalityRef: React.MutableRefObject<PersonalityKey>
  memoriesRef: React.MutableRefObject<string>
  conversationRef: React.MutableRefObject<ConversationEntry[]>
  imagePayloadRef?: React.MutableRefObject<string | null>
  onImageConsumed?: () => void
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useVoiceStateMachine(options: UseVoiceStateMachineOptions) {
  const { userId, personalityRef, memoriesRef, conversationRef, imagePayloadRef, onImageConsumed } = options

  /* ── Public reactive state ──────────────────────────────────────────────── */
  const [state, setState] = useState<VoiceState>("idle")
  const [audioLevel, setAudioLevel] = useState(0)
  const [statusText, setStatusText] = useState("Tap anywhere to speak")
  const [lastTranscript, setLastTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState("")
  const [lastResponse, setLastResponse] = useState("")

  /* ── Emotion detection ────────────────────────────────────────────────── */
  const { analyzeRecording, getSmoothedAdaptation, resetEmotion, currentEmotion }
    = useEmotionDetector()

  /* ── Internal refs ──────────────────────────────────────────────────────── */
  const abortControllerRef = useRef<AbortController | null>(null)
  const isTransitioningRef = useRef(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const levelAnimRef = useRef<number | null>(null)
  const hasSpokenRef = useRef(false)

  const lastTimeDomainSnapshotRef = useRef<Float32Array | null>(null)
  const lastFreqSnapshotRef = useRef<Uint8Array | null>(null)
  const recordingStartRef = useRef<number>(0)

  const audioQueueRef = useRef<AudioQueue | null>(null)
  const continuousRef = useRef(false)

  /**
   * Stable refs for internal functions so that event-handler closures
   * (MediaRecorder.onstop, Audio.onended, …) always call the latest version.
   */
  const fnRef = useRef<{
    startRecording: () => Promise<void>
    transcribeAudio: (blob: Blob) => Promise<void>
    getAIResponse: () => Promise<void>
    speakTextChunk: (text: string) => Promise<void>
  }>({
    startRecording: async () => {},
    transcribeAudio: async () => {},
    getAIResponse: async () => {},
    speakTextChunk: async () => {},
  })

  /* ── AbortController helpers ────────────────────────────────────────────── */

  const cancelAbort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
  }, [])

  const freshAbort = useCallback((): AbortController => {
    cancelAbort()
    const ctrl = new AbortController()
    abortControllerRef.current = ctrl
    return ctrl
  }, [cancelAbort])

  /* ── Reset to idle (always safe) ────────────────────────────────────────── */

  const resetToIdle = useCallback(() => {
    setState("idle")
    setStatusText("Tap anywhere to speak")
    isTransitioningRef.current = false
    resetEmotion()
  }, [resetEmotion])

  /* ── Recording-input audio monitor ──────────────────────────────────────── */

  const startAudioMonitor = useCallback((stream: MediaStream) => {
    recordingStartRef.current = Date.now()
    const AC = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new AC()
    audioContextRef.current = ctx

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.3
    analyserRef.current = analyser

    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)

    const timeDomain = new Float32Array(analyser.fftSize)
    const freqData = new Uint8Array(analyser.frequencyBinCount)

    const SPEECH_THRESH = 0.04
    const SILENCE_THRESH = 0.025
    const SILENCE_MS = 1500
    const MAX_RECORD_MS = 30_000
    const NO_SPEECH_MS = 5000   // stop recording if no speech detected within 5s
    let silentFrameCount = 0
    const SILENT_FRAMES_NEEDED = 12  // ~200ms of consecutive silence at 60fps

    const noSpeechTimer = setTimeout(() => {
      if (!hasSpokenRef.current && mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
    }, NO_SPEECH_MS)

    const maxTimer = setTimeout(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
    }, MAX_RECORD_MS)

    const monitor = () => {
      analyser.getFloatTimeDomainData(timeDomain)
      let sum = 0
      for (let i = 0; i < timeDomain.length; i++) sum += timeDomain[i] * timeDomain[i]
      const rms = Math.sqrt(sum / timeDomain.length)

      analyser.getByteFrequencyData(freqData)
      let fSum = 0
      for (let i = 0; i < freqData.length; i++) fSum += freqData[i]
      const vizLevel = Math.min(1, (fSum / freqData.length / 255) * 4)
      setAudioLevel(vizLevel)

      // Snapshot audio data for emotion detection
      lastTimeDomainSnapshotRef.current = new Float32Array(timeDomain)
      lastFreqSnapshotRef.current = new Uint8Array(freqData)

      if (rms > SPEECH_THRESH) {
        hasSpokenRef.current = true
        silentFrameCount = 0
        clearTimeout(noSpeechTimer)
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }

      if (hasSpokenRef.current && rms < SILENCE_THRESH) {
        silentFrameCount++
        // Only start silence timer after consistent silence (not single-frame dips)
        if (silentFrameCount >= SILENT_FRAMES_NEEDED && !silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop()
            }
          }, SILENCE_MS)
        }
      } else if (rms >= SILENCE_THRESH) {
        silentFrameCount = 0
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }

      levelAnimRef.current = requestAnimationFrame(monitor)
    }

    ;(analyser as any)._maxTimer = maxTimer
    ;(analyser as any)._noSpeechTimer = noSpeechTimer
    levelAnimRef.current = requestAnimationFrame(monitor)
  }, [])

  const stopAudioMonitor = useCallback(() => {
    if (levelAnimRef.current) cancelAnimationFrame(levelAnimRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (analyserRef.current && (analyserRef.current as any)._maxTimer) {
      clearTimeout((analyserRef.current as any)._maxTimer)
    }
    if (analyserRef.current && (analyserRef.current as any)._noSpeechTimer) {
      clearTimeout((analyserRef.current as any)._noSpeechTimer)
    }

    // Analyze emotion from last audio snapshot before clearing
    if (lastTimeDomainSnapshotRef.current && lastFreqSnapshotRef.current) {
      analyzeRecording(
        lastTimeDomainSnapshotRef.current,
        lastFreqSnapshotRef.current
      )
    }
    lastTimeDomainSnapshotRef.current = null
    lastFreqSnapshotRef.current = null

    silenceTimerRef.current = null
    levelAnimRef.current = null
    hasSpokenRef.current = false
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    analyserRef.current = null
    setAudioLevel(0)
  }, [analyzeRecording])

  /* ── AudioQueue init ─────────────────────────────────────────── */

  const initQueue = useCallback(() => {
    if (!audioQueueRef.current) {
      audioQueueRef.current = new AudioQueue()
      audioQueueRef.current.onLevelUpdate = (level) => {
        setAudioLevel(level)
      }
      audioQueueRef.current.onEnded = () => {
        if (continuousRef.current) {
          fnRef.current.startRecording().catch(() => resetToIdle())
        } else {
          resetToIdle()
        }
      }
    }
  }, [resetToIdle])

  /* ═══════════════════════════════════════════════════════════════════════════
     Core voice-flow functions
     (defined bottom-up so every fn can reference later fns via fnRef)
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── speakTextChunk ─────────────────────────────────────────────────────── */

  const speakTextChunk = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      setState((s) => (s !== "speaking" ? "speaking" : s))
      setStatusText("")
      initQueue()

      try {
        const adaptation = getSmoothedAdaptation()
        const res = await fetch(
          "/api/v1/tts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cache-Control": "max-age=86400" },
            body: JSON.stringify({
              text,
              stability: adaptation.ttsStability,
              similarityBoost: adaptation.ttsSimilarityBoost,
              style: adaptation.ttsStyle,
            }),
          }
        )
        if (!res.ok) throw new Error("TTS chunk failed")

        const arrayBuffer = await res.arrayBuffer()
        if (audioQueueRef.current) {
          await audioQueueRef.current.enqueue(arrayBuffer)
        }
      } catch (err) {
        console.error("speakTextChunk err:", err)
      }
    },
    [initQueue, getSmoothedAdaptation],
  )

  /* ── getAIResponse ──────────────────────────────────────────────────────── */

  const getAIResponse = useCallback(async () => {
    cancelAbort()
    setState("thinking")
    setStatusText("Thinking...")
    const ctrl = freshAbort()

    const MAX_RETRIES = 2
    let attempt = 0

    while (attempt < MAX_RETRIES) {
      attempt++
      try {
        const msgs = conversationRef.current.map((m) => ({
          role: m.role,
          content: m.content,
          image: m.image,
        }))

        const adaptation = getSmoothedAdaptation()
        const emotionSuffix = adaptation.systemPromptSuffix
          ? `\n\nEMOTION CONTEXT:\n${adaptation.systemPromptSuffix}`
          : ''

        const res = await fetchWithTimeout(
          "/api/v1/chat",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: msgs,
              personality: personalityRef.current,
              memories: memoriesRef.current + emotionSuffix,
              maxOutputTokens: adaptation.maxOutputTokens,
            }),
            signal: ctrl.signal,
          },
          STREAM_CHAT_TIMEOUT,
        )

        // Retryable server errors (503 only) — wait then retry
        // Note: 429 from voice limit should NOT be retried — show specific error
        if (res.status === 429 && attempt < MAX_RETRIES) {
          // Check if it's a hard voice limit vs soft rate limit
          try {
            const errData = await res.clone().json()
            if (errData.code === 'USAGE_LIMIT_EXCEEDED') {
              setStreamingText("")
              setLastResponse("")
              setError("Daily voice limit reached — upgrade for unlimited access")
              continuousRef.current = false  // stop continuous mode so recording doesn't restart
              resetToIdle()
              return
            }
          } catch {}
          // Soft rate limit — wait and retry
          await new Promise((r) => setTimeout(r, 1000 * attempt))
          continue
        }

        if (res.status === 503 && attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt))
          continue
        }

        if (!res.ok) throw new Error(`Error ${res.status}`)

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No stream")

        const dec = new TextDecoder()
        let full = ""
        let sentenceBuffer = ""
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          for (const line of dec.decode(value, { stream: true }).split("\n")) {
            if (!line.startsWith("data: ")) continue
            const d = line.slice(6).trim()
            if (d === "[DONE]") continue
            try {
              const p = JSON.parse(d)
              if (p.text) {
                full += p.text
                sentenceBuffer += p.text
                setStreamingText(full)
                
                // Real-time chunk extraction
                if (shouldUseTTS(full, true)) {
                  // Match punctuation followed by space or newline, or quotation marks that usually end sentences
                  const match = sentenceBuffer.match(/([.!?]+[\s"']+)/)
                  if (match) {
                    const splitIndex = match.index! + match[1].length
                    const sentence = sentenceBuffer.slice(0, splitIndex).trim()
                    sentenceBuffer = sentenceBuffer.slice(splitIndex)
                    if (sentence) {
                      fnRef.current.speakTextChunk(sentence).catch(console.error)
                    }
                  }
                }
              }
            } catch {}
          }
        }

        // Flush any remaining partial sentence
        if (shouldUseTTS(full, true) && sentenceBuffer.trim()) {
          fnRef.current.speakTextChunk(sentenceBuffer.trim()).catch(console.error)
          sentenceBuffer = ""
        }

        if (!full.trim()) {
          setStreamingText("")
          setLastResponse("")
          setError("Couldn't generate a response — try again")
          if (continuousRef.current) {
            await new Promise((r) => setTimeout(r, 1500))
            await fnRef.current.startRecording()
            return
          }
          resetToIdle()
          return
        }

        setStreamingText("")
        setLastResponse(full)
        conversationRef.current.push({ role: "assistant", content: full })
        if (conversationRef.current.length > 14) {
          conversationRef.current = conversationRef.current.slice(-14)
        }

        // Auto-save memory (fire-and-forget)
        if (userId && conversationRef.current.length >= 4) {
          const memInteractionCount = conversationRef.current.filter(m => m.role === "user").length
          const payload = JSON.stringify({
            conversation: conversationRef.current,
            interactionCount: memInteractionCount,
          })
          fetch("/api/v1/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          }).catch(() => {})
        }

        // If not using TTS, we handle continuous loop manually since AudioQueue won't trigger onEnded
        if (!shouldUseTTS(full, true)) {
          // Code blocks or voice disabled — show text only, skip TTS
          if (continuousRef.current) {
            await fnRef.current.startRecording()
          } else {
            resetToIdle()
          }
        }
        return // success — exit retry loop

      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStreamingText("")
          setLastResponse("")
          resetToIdle()
          return
        }

        // If we have retries left, wait and retry silently
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 800 * attempt))
          continue
        }

        // All retries exhausted — remove the last user message to prevent broken context
        setStreamingText("")
        setLastResponse("")
        setError("Failed to get response — tap to try again")
        // Remove the last user message that caused the failure
        const lastMsg = conversationRef.current[conversationRef.current.length - 1]
        if (lastMsg?.role === "user") {
          conversationRef.current.pop()
        }
        if (continuousRef.current) {
          continuousRef.current = false // Stop continuous mode on persistent failure
        }
        resetToIdle()
      }
    }
  }, [
    freshAbort,
    cancelAbort,
    conversationRef,
    personalityRef,
    memoriesRef,
    userId,
    resetToIdle,
    getSmoothedAdaptation,
  ])

  /* ── transcribeAudio ────────────────────────────────────────────────────── */

  const transcribeAudio = useCallback(
    async (blob: Blob) => {
      cancelAbort()
      setState("transcribing")
      setStatusText("Processing...")
      const ctrl = freshAbort()

      try {
        const fd = new FormData()
        fd.append("audio", blob, "recording.webm")

        const res = await fetchWithTimeout(
          "/api/v1/stt",
          { method: "POST", body: fd, signal: ctrl.signal },
          STT_TIMEOUT,
        )
        if (!res.ok) throw new Error("STT failed")

        const data = await res.json()
        // Handle new API envelope format
        const text = (data.data?.text ?? data.text)?.trim()

        if (!text) {
          if (continuousRef.current) {
            await fnRef.current.startRecording()
          } else {
            setState("idle")
            setStatusText("Didn't catch that \u2014 try again")
            setTimeout(() => setStatusText("Tap anywhere to speak"), 2500)
            isTransitioningRef.current = false
          }
          return
        }

        setLastTranscript(text)
        
        let imageToAttach = undefined
        if (imagePayloadRef && imagePayloadRef.current) {
          imageToAttach = imagePayloadRef.current
          imagePayloadRef.current = null
          if (onImageConsumed) onImageConsumed()
        }
        
        conversationRef.current.push({ role: "user", content: text, image: imageToAttach })
        await fnRef.current.getAIResponse()
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          resetToIdle()
          return
        }
        if (continuousRef.current) {
          setError("Transcription hiccup \u2014 listening again...")
          await fnRef.current.startRecording()
        } else {
          setError("Transcription failed. Try again.")
          resetToIdle()
        }
      }
    },
    [freshAbort, cancelAbort, conversationRef, resetToIdle],
  )

  /* ── startRecording ─────────────────────────────────────────────────────── */

  const startRecording = useCallback(async () => {
    if (isTransitioningRef.current) return
    isTransitioningRef.current = true

    try {
      cancelAbort()
      if (audioQueueRef.current) {
        audioQueueRef.current.interrupt()
        audioQueueRef.current = null
      }

      setState("recording")
      setStatusText("Listening...")
      setError(null)
      setLastTranscript("")
      setLastResponse("")
      audioChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream
      startAudioMonitor(stream)

      const mime = getBestAudioMimeType() || "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        stopAudioMonitor()

        const blob = new Blob(audioChunksRef.current, { type: mime })
        if (blob.size < 500) {
          if (continuousRef.current) {
            isTransitioningRef.current = false
            fnRef.current.startRecording()
          } else {
            setState("idle")
            setStatusText("Didn't catch that \u2014 try again")
            setTimeout(() => setStatusText("Tap anywhere to speak"), 2000)
            isTransitioningRef.current = false
          }
          return
        }
        await fnRef.current.transcribeAudio(blob)
      }

      recorder.start()
      isTransitioningRef.current = false
    } catch {
      setError("Microphone access denied.")
      resetToIdle()
    }
  }, [cancelAbort, startAudioMonitor, stopAudioMonitor, resetToIdle])

  /* ── stopRecording (graceful — triggers transcription) ──────────────────── */

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop()
    }
  }, [])

  /* ── cancelAll (hard stop, resets to idle) ──────────────────────────────── */

  const cancelAll = useCallback(() => {
    continuousRef.current = false
    isTransitioningRef.current = false
    cancelAbort()
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop()
    if (audioQueueRef.current) {
      audioQueueRef.current.interrupt()
      audioQueueRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    stopAudioMonitor()
    resetToIdle()
  }, [cancelAbort, stopAudioMonitor, resetToIdle])

  /* ── handleTap (main interaction entry-point) ───────────────────────────── */

  const handleTap = useCallback(() => {
    if (state === "idle") {
      continuousRef.current = true
      fnRef.current.startRecording()
    } else if (state === "speaking" || state === "thinking") {
      // Interrupt current operation and start recording
      cancelAbort()
      if (audioQueueRef.current) {
        audioQueueRef.current.interrupt()
        audioQueueRef.current = null
      }
      continuousRef.current = true
      isTransitioningRef.current = false
      fnRef.current.startRecording()
    } else {
      // recording or transcribing → full stop
      cancelAll()
    }
  }, [state, cancelAbort, cancelAll])

  /* ── greet (initial greeting with auto-continue) ────────────────────────── */

  const greet = useCallback(
    async (text: string) => {
      cancelAbort()
      setState("speaking")
      setStatusText("")

      try {
        await fnRef.current.speakTextChunk(text)
        conversationRef.current.push({ role: "assistant", content: text })

        // After greeting, enter continuous recording
        continuousRef.current = true
        // The audioQueueRef.onEnded will automatically trigger startRecording when it finishes!
      } catch {
        resetToIdle()
      }
    },
    [
      cancelAbort,
      resetToIdle,
      conversationRef,
    ],
  )

  /* ── saveMemoryBeacon (safe sendBeacon with size check) ─────────────────── */

  const saveMemoryBeacon = useCallback(() => {
    const uid = userId
    const convo = conversationRef.current
    if (!uid || convo.length < 2) return

    const interactionCount = convo.filter((m) => m.role === "user").length

    let messages = convo
    let payload = JSON.stringify({
      conversation: messages,
      interactionCount,
    })

    // sendBeacon payloads should stay under 64 KB
    if (payload.length >= 60_000) {
      messages = convo.slice(-6)
      payload = JSON.stringify({
        conversation: messages,
        interactionCount,
      })
    }

    navigator.sendBeacon(
      "/api/v1/memory",
      new Blob([payload], { type: "application/json" }),
    )
  }, [userId, conversationRef, memoriesRef])

  /* ── Keep fnRef in sync after every render ──────────────────────────────── */

  useEffect(() => {
    fnRef.current = {
      startRecording,
      transcribeAudio,
      getAIResponse,
      speakTextChunk,
    }
  })

  /* ── Public API ─────────────────────────────────────────────────────────── */

  return {
    state,
    audioLevel,
    statusText,
    lastTranscript,
    error,
    setError,
    streamingText,
    lastResponse,
    startRecording,
    stopRecording,
    cancelAll,
    handleTap,
    greet,
    saveMemoryBeacon,
    currentEmotion,
  }
}
