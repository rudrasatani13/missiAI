"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  fetchWithTimeout,
  STREAM_CHAT_TIMEOUT,
  TTS_TIMEOUT,
  STT_TIMEOUT,
} from "@/lib/fetch-with-timeout"
import { getBestAudioMimeType } from "@/lib/browser-support"
import { shouldUseTTS, truncateForTTS } from "@/lib/tts-optimizer"
import type { VoiceState, ConversationEntry, PersonalityKey } from "@/types/chat"

export type { VoiceState }

export interface UseVoiceStateMachineOptions {
  userId?: string
  personalityRef: React.MutableRefObject<PersonalityKey>
  memoriesRef: React.MutableRefObject<string>
  conversationRef: React.MutableRefObject<ConversationEntry[]>
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useVoiceStateMachine(options: UseVoiceStateMachineOptions) {
  const { userId, personalityRef, memoriesRef, conversationRef } = options

  /* ── Public reactive state ──────────────────────────────────────────────── */
  const [state, setState] = useState<VoiceState>("idle")
  const [audioLevel, setAudioLevel] = useState(0)
  const [statusText, setStatusText] = useState("Tap anywhere to speak")
  const [lastTranscript, setLastTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState("")

  /* ── Internal refs ──────────────────────────────────────────────────────── */
  const abortControllerRef = useRef<AbortController | null>(null)
  const isTransitioningRef = useRef(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const levelAnimRef = useRef<number | null>(null)
  const hasSpokenRef = useRef(false)

  const ttsContextRef = useRef<AudioContext | null>(null)
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null)
  const continuousRef = useRef(false)

  /**
   * Stable refs for internal functions so that event-handler closures
   * (MediaRecorder.onstop, Audio.onended, …) always call the latest version.
   */
  const fnRef = useRef<{
    startRecording: () => Promise<void>
    transcribeAudio: (blob: Blob) => Promise<void>
    getAIResponse: () => Promise<void>
    speakText: (text: string) => Promise<void>
  }>({
    startRecording: async () => {},
    transcribeAudio: async () => {},
    getAIResponse: async () => {},
    speakText: async () => {},
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
  }, [])

  /* ── Recording-input audio monitor ──────────────────────────────────────── */

  const startAudioMonitor = useCallback((stream: MediaStream) => {
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

    const SPEECH_THRESH = 0.015
    const SILENCE_THRESH = 0.008
    const SILENCE_MS = 1800
    const MAX_RECORD_MS = 30_000

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

      if (rms > SPEECH_THRESH) {
        hasSpokenRef.current = true
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current)
          silenceTimerRef.current = null
        }
      }

      if (hasSpokenRef.current && rms < SILENCE_THRESH) {
        if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            if (mediaRecorderRef.current?.state === "recording") {
              mediaRecorderRef.current.stop()
            }
          }, SILENCE_MS)
        }
      } else if (rms >= SILENCE_THRESH && silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }

      levelAnimRef.current = requestAnimationFrame(monitor)
    }

    ;(analyser as any)._maxTimer = maxTimer
    levelAnimRef.current = requestAnimationFrame(monitor)
  }, [])

  const stopAudioMonitor = useCallback(() => {
    if (levelAnimRef.current) cancelAnimationFrame(levelAnimRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (analyserRef.current && (analyserRef.current as any)._maxTimer) {
      clearTimeout((analyserRef.current as any)._maxTimer)
    }
    silenceTimerRef.current = null
    levelAnimRef.current = null
    hasSpokenRef.current = false
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    analyserRef.current = null
    setAudioLevel(0)
  }, [])

  /* ── TTS playback audio monitor ─────────────────────────────────────────── */

  const startTTSMonitor = useCallback((audio: HTMLAudioElement) => {
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      const ctx = ttsContextRef.current || new AC()
      ttsContextRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.85
      ttsAnalyserRef.current = analyser
      const source = ctx.createMediaElementSource(audio)
      source.connect(analyser)
      analyser.connect(ctx.destination)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const monitor = () => {
        if (!ttsAnalyserRef.current) return
        ttsAnalyserRef.current.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
        const rms = Math.sqrt(sum / data.length) / 255
        setAudioLevel(Math.min(1, rms * 4))
        levelAnimRef.current = requestAnimationFrame(monitor)
      }
      levelAnimRef.current = requestAnimationFrame(monitor)
    } catch (err) {
      console.error("TTS monitor error:", err)
    }
  }, [])

  const stopTTSMonitor = useCallback(() => {
    if (levelAnimRef.current) cancelAnimationFrame(levelAnimRef.current)
    levelAnimRef.current = null
    ttsAnalyserRef.current = null
    setAudioLevel(0)
  }, [])

  /* ═══════════════════════════════════════════════════════════════════════════
     Core voice-flow functions
     (defined bottom-up so every fn can reference later fns via fnRef)
     ═══════════════════════════════════════════════════════════════════════ */

  /* ── speakText ──────────────────────────────────────────────────────────── */

  const speakText = useCallback(
    async (text: string) => {
      cancelAbort()
      setState("speaking")
      setStatusText("")
      const ctrl = freshAbort()

      try {
        const res = await fetchWithTimeout(
          "/api/tts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: ctrl.signal,
          },
          TTS_TIMEOUT,
        )
        if (!res.ok) throw new Error("TTS failed")

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (audioPlayerRef.current) audioPlayerRef.current.pause()
        const audio = new Audio(url)
        audioPlayerRef.current = audio
        startTTSMonitor(audio)

        // Set up end/error handlers BEFORE play()
        const finished = new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            stopTTSMonitor()
            URL.revokeObjectURL(url)
            audioPlayerRef.current = null
            resolve()
          }
          audio.onerror = () => {
            stopTTSMonitor()
            URL.revokeObjectURL(url)
            audioPlayerRef.current = null
            reject(new Error("Audio playback error"))
          }
        })

        await audio.play()
        await finished

        // After speaking, continue or idle
        if (continuousRef.current) {
          await fnRef.current.startRecording()
        } else {
          resetToIdle()
        }
      } catch (err) {
        stopTTSMonitor()
        if (err instanceof Error && err.name === "AbortError") {
          resetToIdle()
          return
        }
        if (continuousRef.current) {
          await fnRef.current.startRecording()
        } else {
          resetToIdle()
        }
      } finally {
        isTransitioningRef.current = false
      }
    },
    [freshAbort, cancelAbort, startTTSMonitor, stopTTSMonitor, resetToIdle],
  )

  /* ── getAIResponse ──────────────────────────────────────────────────────── */

  const getAIResponse = useCallback(async () => {
    cancelAbort()
    setState("thinking")
    setStatusText("Thinking...")
    const ctrl = freshAbort()

    try {
      const msgs = conversationRef.current.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetchWithTimeout(
        "/api/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: msgs,
            personality: personalityRef.current,
          }),
          signal: ctrl.signal,
        },
        STREAM_CHAT_TIMEOUT,
      )
      if (!res.ok) throw new Error(`Error ${res.status}`)

      const reader = res.body?.getReader()
      if (!reader) throw new Error("No stream")

      const dec = new TextDecoder()
      let full = ""
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
              setStreamingText(full)
            }
          } catch {}
        }
      }

      if (!full.trim()) {
        setStreamingText("")
        if (continuousRef.current) {
          await fnRef.current.startRecording()
          return
        }
        resetToIdle()
        return
      }

      setStreamingText("")
      conversationRef.current.push({ role: "assistant", content: full })
      if (conversationRef.current.length > 20) {
        conversationRef.current = conversationRef.current.slice(-20)
      }

      // Auto-save memory (fire-and-forget)
      if (userId && conversationRef.current.length >= 4) {
        const payload = JSON.stringify({
          conversation: conversationRef.current,
        })
        fetch("/api/memory", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.store?.facts) {
              memoriesRef.current = data.store.facts.map((f: any) => f.text).join("\n")
            }
          })
          .catch(() => {})
      }

      // TTS optimization: skip TTS for long/code/list responses
      if (shouldUseTTS(full, true)) {
        const ttsText = truncateForTTS(full)
        await fnRef.current.speakText(ttsText)
      } else {
        // Skip TTS — go directly to idle or continuous recording
        if (continuousRef.current) {
          await fnRef.current.startRecording()
        } else {
          resetToIdle()
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStreamingText("")
        resetToIdle()
        return
      }
      setStreamingText("")
      setError("Failed to get response.")
      if (continuousRef.current) {
        setTimeout(() => {
          if (continuousRef.current) fnRef.current.startRecording()
        }, 1500)
      } else {
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
          "/api/stt",
          { method: "POST", body: fd, signal: ctrl.signal },
          STT_TIMEOUT,
        )
        if (!res.ok) throw new Error("STT failed")

        const data = await res.json()
        const text = data.text?.trim()

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
        conversationRef.current.push({ role: "user", content: text })
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
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }
      stopTTSMonitor()

      setState("recording")
      setStatusText("Listening...")
      setError(null)
      setLastTranscript("")
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
  }, [cancelAbort, startAudioMonitor, stopAudioMonitor, stopTTSMonitor, resetToIdle])

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
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    stopAudioMonitor()
    stopTTSMonitor()
    resetToIdle()
  }, [cancelAbort, stopAudioMonitor, stopTTSMonitor, resetToIdle])

  /* ── handleTap (main interaction entry-point) ───────────────────────────── */

  const handleTap = useCallback(() => {
    if (state === "idle") {
      continuousRef.current = true
      fnRef.current.startRecording()
    } else if (state === "speaking" || state === "thinking") {
      // Interrupt current operation and start recording
      cancelAbort()
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }
      stopTTSMonitor()
      continuousRef.current = true
      isTransitioningRef.current = false
      fnRef.current.startRecording()
    } else {
      // recording or transcribing → full stop
      cancelAll()
    }
  }, [state, cancelAbort, stopTTSMonitor, cancelAll])

  /* ── greet (initial greeting with auto-continue) ────────────────────────── */

  const greet = useCallback(
    async (text: string) => {
      cancelAbort()
      setState("speaking")
      setStatusText("")
      const ctrl = freshAbort()

      try {
        const res = await fetchWithTimeout(
          "/api/tts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: ctrl.signal,
          },
          TTS_TIMEOUT,
        )
        if (!res.ok) {
          resetToIdle()
          return
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (audioPlayerRef.current) audioPlayerRef.current.pause()
        const audio = new Audio(url)
        audioPlayerRef.current = audio
        startTTSMonitor(audio)

        const finished = new Promise<void>((resolve, reject) => {
          audio.onended = () => {
            stopTTSMonitor()
            URL.revokeObjectURL(url)
            audioPlayerRef.current = null
            resolve()
          }
          audio.onerror = () => {
            stopTTSMonitor()
            URL.revokeObjectURL(url)
            audioPlayerRef.current = null
            reject(new Error("Audio playback error"))
          }
        })

        await audio.play()
        conversationRef.current.push({ role: "assistant", content: text })
        await finished

        // After greeting, enter continuous recording
        continuousRef.current = true
        await fnRef.current.startRecording()
      } catch {
        resetToIdle()
      }
    },
    [
      cancelAbort,
      freshAbort,
      startTTSMonitor,
      stopTTSMonitor,
      resetToIdle,
      conversationRef,
    ],
  )

  /* ── saveMemoryBeacon (safe sendBeacon with size check) ─────────────────── */

  const saveMemoryBeacon = useCallback(() => {
    const uid = userId
    const convo = conversationRef.current
    if (!uid || convo.length < 2) return

    let messages = convo
    let payload = JSON.stringify({
      conversation: messages,
    })

    // sendBeacon payloads should stay under 64 KB
    if (payload.length >= 60_000) {
      messages = convo.slice(-6)
      payload = JSON.stringify({
        conversation: messages,
      })
    }

    navigator.sendBeacon(
      "/api/memory",
      new Blob([payload], { type: "application/json" }),
    )
  }, [userId, conversationRef, memoriesRef])

  /* ── Keep fnRef in sync after every render ──────────────────────────────── */

  useEffect(() => {
    fnRef.current = {
      startRecording,
      transcribeAudio,
      getAIResponse,
      speakText,
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
    startRecording,
    stopRecording,
    cancelAll,
    handleTap,
    greet,
    saveMemoryBeacon,
  }
}
