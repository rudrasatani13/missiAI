"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  fetchWithTimeout,
  STREAM_CHAT_TIMEOUT,
  TTS_TIMEOUT,
  STT_TIMEOUT,
} from "@/lib/client/fetch-with-timeout"
import { getBestAudioMimeType, isMobileBrowser, speakWithWebSpeechAPI } from "@/lib/client/browser-support"
import { shouldUseTTS, truncateForTTS } from "@/lib/ai/tts-optimizer"
import { PCMPlayer, globalPcmPlayer } from "@/lib/client/pcm-player"
import type { VoiceState, ConversationEntry, PersonalityKey } from "@/types/chat"
import { useEmotionDetector } from "@/hooks/useEmotionDetector"
import type { EmotionAdaptation } from "@/types/emotion"

export type { VoiceState }

export interface UseVoiceStateMachineOptions {
  userId?: string
  personalityRef: React.MutableRefObject<PersonalityKey>
  customPromptRef?: React.MutableRefObject<string>
  memoriesRef?: React.MutableRefObject<string>
  conversationRef: React.MutableRefObject<ConversationEntry[]>
  imagePayloadRef?: React.MutableRefObject<string | null>
  onImageConsumed?: () => void
}

/* ── Hook ─────────────────────────────────────────────────────────────────── */

export function useVoiceStateMachine(options: UseVoiceStateMachineOptions) {
  const { userId, personalityRef, customPromptRef, memoriesRef, conversationRef, imagePayloadRef, onImageConsumed } = options

  /* ── Public reactive state ──────────────────────────────────────────────── */
  const [state, setState] = useState<VoiceState>("idle")
  const [audioLevel, setAudioLevel] = useState(0)
  const [statusText, setStatusText] = useState("Tap anywhere to speak")
  const [lastTranscript, setLastTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [streamingText, setStreamingText] = useState("")
  const [lastResponse, setLastResponse] = useState("")

  /* ── Agentic workflow steps ────────────────────────────────────────────── */
  const [agentSteps, setAgentSteps] = useState<{ toolName: string; status: string; label: string; summary?: string }[]>([])

  /* ── Emotion detection ────────────────────────────────────────────────── */
  const { analyzeRecording, getSmoothedAdaptation, resetEmotion, currentEmotion }
    = useEmotionDetector()

  /* ── Internal refs ──────────────────────────────────────────────────────── */
  const abortControllerRef = useRef<AbortController | null>(null)
  const isTransitioningRef = useRef(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  /** Duration of the last recording in ms (for time-based voice billing) */
  const lastRecordingDurationMsRef = useRef<number>(0)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const noSpeechTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const levelAnimRef = useRef<number | null>(null)
  const hasSpokenRef = useRef(false)

  const lastTimeDomainSnapshotRef = useRef<Float32Array | null>(null)
  const lastFreqSnapshotRef = useRef<Uint8Array | null>(null)
  const recordingStartRef = useRef<number>(0)

  const ttsContextRef = useRef<AudioContext | null>(null)
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null)
  const continuousRef = useRef(false)
  /** EDITH mode: agent asked a follow-up question — extend silence timeout & auto-record */
  const expectingResponseRef = useRef(false)
  /** EDITH mode: always active — auto-restart recording after every response.
   *  BUG-004 fix: Defaults to false. Set to true when user explicitly enables continuous mode. */
  const edithModeRef = useRef(false)
  const pcmPlayerRef = useRef<PCMPlayer | null>(null)
  const stateRef = useRef<VoiceState>("idle")
  
  // Keep stateRef synced so closures can read the latest state
  useEffect(() => { stateRef.current = state }, [state])

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

  /* ── Mobile audio unlock ────────────────────────────────────────────────── */
  // iOS/Android block audio playback until the user interacts with the page.
  // We prime the AudioContext on EVERY user gesture to maximize unlock success.
  const audioUnlockedRef = useRef(false)
  const isMobileRef = useRef(false)

  useEffect(() => {
    isMobileRef.current = isMobileBrowser()
  }, [])

  useEffect(() => {
    // On mobile, we need to be more aggressive — listen on EVERY gesture,
    // not just the first one. iOS Safari revokes audio permission if the
    // AudioContext is not used within the same gesture callback chain.
    const unlock = () => {
      audioUnlockedRef.current = true
      // Create and immediately resume an AudioContext to satisfy the gesture requirement
      try {
        const AC = window.AudioContext || (window as any).webkitAudioContext
        const ctx = new AC()
        ctx.resume().then(() => ctx.close()).catch(() => {})
        
        globalPcmPlayer.init();
      } catch {}
      // Also play a silent audio to unlock HTMLAudioElement playback
      try {
        const silence = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=")
        silence.volume = 0
        silence.preload = 'auto'
        silence.setAttribute('playsinline', 'true')
        silence.setAttribute('webkit-playsinline', 'true')
        silence.play().then(() => silence.pause()).catch(() => {})
      } catch {}
      // On non-mobile, remove after first successful unlock
      if (!isMobileRef.current) {
        document.removeEventListener("pointerdown", unlock)
        document.removeEventListener("touchstart", unlock)
        document.removeEventListener("click", unlock)
      }
    }
    document.addEventListener("pointerdown", unlock)
    document.addEventListener("touchstart", unlock)
    document.addEventListener("click", unlock)
    return () => {
      document.removeEventListener("pointerdown", unlock)
      document.removeEventListener("touchstart", unlock)
      document.removeEventListener("click", unlock)
    }
  }, [])

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
    // iOS Safari suspends AudioContext until a user gesture — resume it
    if (ctx.state === "suspended") ctx.resume().catch(() => {})
    audioContextRef.current = ctx

    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.6
    analyserRef.current = analyser

    const source = ctx.createMediaStreamSource(stream)
    source.connect(analyser)

    const timeDomain = new Float32Array(analyser.fftSize)
    const freqData = new Uint8Array(analyser.frequencyBinCount)

    const SPEECH_THRESH = 0.04
    const SILENCE_THRESH = 0.025
    // BUG-008 fix: Read expectingResponseRef dynamically inside the callback
    // instead of capturing SILENCE_MS once at recording start.
    const getSilenceMs = () => expectingResponseRef.current ? 4000 : 1500
    const MAX_RECORD_MS = 30_000
    const NO_SPEECH_MS = 5000   // stop recording if no speech detected within 5s
    let silentFrameCount = 0
    const SILENT_FRAMES_NEEDED = 12  // ~200ms of consecutive silence at 60fps

    noSpeechTimerRef.current = setTimeout(() => {
      if (!hasSpokenRef.current && mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop()
      }
    }, NO_SPEECH_MS)

    maxTimerRef.current = setTimeout(() => {
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
      const vizLevel = Math.min(1, (fSum / freqData.length / 255) * 2)
      setAudioLevel(vizLevel)

      // Snapshot audio data for emotion detection
      lastTimeDomainSnapshotRef.current = new Float32Array(timeDomain)
      lastFreqSnapshotRef.current = new Uint8Array(freqData)

      if (rms > SPEECH_THRESH) {
        // ── VAD Interruption: User spoke while Missi is speaking ──
        if (stateRef.current === "speaking") {
          // Stop HTML audio playback
          if (audioPlayerRef.current) {
            audioPlayerRef.current.pause()
            audioPlayerRef.current = null
          }
          // Stop PCM player if active
          if (pcmPlayerRef.current) {
            pcmPlayerRef.current.stop()
            pcmPlayerRef.current = null
          }
          stopTTSMonitor()
          cancelAbort()
          setState("idle")
          setStreamingText("")
          setStatusText("Tap anywhere to speak")
        }
        hasSpokenRef.current = true
        silentFrameCount = 0
        if (noSpeechTimerRef.current) {
          clearTimeout(noSpeechTimerRef.current)
          noSpeechTimerRef.current = null
        }
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
          }, getSilenceMs()) // BUG-008 fix: dynamic silence timeout
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

    levelAnimRef.current = requestAnimationFrame(monitor)
  }, [])

  const stopAudioMonitor = useCallback(() => {
    if (levelAnimRef.current) cancelAnimationFrame(levelAnimRef.current)
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current)
    if (noSpeechTimerRef.current) clearTimeout(noSpeechTimerRef.current)

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

  /* ── TTS playback audio monitor ─────────────────────────────────────────── */

  const ttsSourceRef = useRef<MediaElementAudioSourceNode | null>(null)

  const startTTSMonitor = useCallback((audio: HTMLAudioElement) => {
    // CRITICAL: On mobile, createMediaElementSource() re-routes ALL audio
    // through the Web Audio API pipeline. If the AudioContext is suspended
    // (which happens often on iOS/Android), the audio plays but produces
    // NO SOUND — it goes into a dead AudioContext destination.
    // Skip the analyser on mobile; the waveform viz is non-critical.
    if (isMobileRef.current) {
      // Just set a simple fake level based on playing state for visual feedback
      const fakePulse = () => {
        if (!audio || audio.paused || audio.ended) {
          setAudioLevel(0)
          return
        }
        // Gentle pulse effect for visual feedback
        setAudioLevel(0.3 + Math.sin(Date.now() / 200) * 0.2)
        levelAnimRef.current = requestAnimationFrame(fakePulse)
      }
      levelAnimRef.current = requestAnimationFrame(fakePulse)
      return
    }

    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext
      const ctx = ttsContextRef.current || new AC()
      ttsContextRef.current = ctx
      // Desktop: resume AudioContext if suspended
      if (ctx.state === "suspended") ctx.resume().catch(() => {})

      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.92
      ttsAnalyserRef.current = analyser

      // BUG-009: createMediaElementSource can only be called once per HTML element.
      // We create a new Audio() for each playback, so this is safe. The disconnect
      // below cleans up the previous source's routing to avoid orphaned connections.
      if (ttsSourceRef.current) {
        try { ttsSourceRef.current.disconnect() } catch {}
      }
      const source = ctx.createMediaElementSource(audio)
      ttsSourceRef.current = source
      source.connect(analyser)
      analyser.connect(ctx.destination)
      const data = new Uint8Array(analyser.frequencyBinCount)

      const monitor = () => {
        if (!ttsAnalyserRef.current) return
        ttsAnalyserRef.current.getByteFrequencyData(data)
        // Use average frequency (like mic monitor) instead of RMS of squared values.
        // ElevenLabs audio is heavily normalized — raw RMS*4 was maxing out at 1.0
        // constantly, making particles go crazy. This matches the mic monitor's
        // calmer visual behavior.
        let fSum = 0
        for (let i = 0; i < data.length; i++) fSum += data[i]
        const avg = fSum / data.length / 255
        setAudioLevel(Math.min(1, avg * 1.8))
        levelAnimRef.current = requestAnimationFrame(monitor)
      }
      levelAnimRef.current = requestAnimationFrame(monitor)
    } catch (err) {
      // TTS monitor is non-critical — audio still plays without visualization
      console.warn("TTS monitor unavailable:", err)
    }
  }, [])

  const stopTTSMonitor = useCallback(() => {
    if (levelAnimRef.current) cancelAnimationFrame(levelAnimRef.current)
    levelAnimRef.current = null
    if (ttsSourceRef.current) {
      try { ttsSourceRef.current.disconnect() } catch {}
      ttsSourceRef.current = null
    }
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
      // IMPORTANT: Do NOT call cancelAbort()/freshAbort() here!
      // speakText is called FROM getAIResponse — aborting would kill the chat stream.
      // Use a local AbortController for TTS only.
      const ttsAbort = new AbortController()
      setState("speaking")
      setStatusText("")

      /** Helper: move to next state after speaking */
      const afterSpeak = async () => {
        // EDITH mode: ALWAYS restart recording after speaking — like a real assistant
        // Also restart if agent asked a follow-up question or continuous mode is on
        if (edithModeRef.current || expectingResponseRef.current || continuousRef.current) {
          expectingResponseRef.current = false
          await fnRef.current.startRecording()
        } else {
          resetToIdle()
        }
      }

      /** Helper: fallback to Web Speech API for mobile TTS */
      const tryWebSpeechFallback = async (spokenText: string): Promise<boolean> => {
        try {
          await speakWithWebSpeechAPI(spokenText)
          return true
        } catch {
          return false
        }
      }

      try {
        const adaptation = getSmoothedAdaptation()
        const res = await fetchWithTimeout(
          "/api/v1/tts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              stability: adaptation.ttsStability,
              similarityBoost: adaptation.ttsSimilarityBoost,
              style: adaptation.ttsStyle,
              speed: adaptation.ttsSpeed ?? 1.05,
            }),
            signal: ttsAbort.signal,
          },
          TTS_TIMEOUT,
        )
        if (!res.ok) throw new Error("TTS failed")

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (audioPlayerRef.current) audioPlayerRef.current.pause()
        const audio = new Audio(url)
        audio.volume = 1.0
        audio.preload = 'auto'
        audio.setAttribute('playsinline', 'true')
        audio.setAttribute('webkit-playsinline', 'true')
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

        let playSucceeded = false
        try {
          await audio.play()
          playSucceeded = true
          setState("speaking")
          setStatusText("")
        } catch {
          if (isMobileRef.current) {
            // MOBILE FIX: Skip retry, go straight to Web Speech fallback
            playSucceeded = false
          } else {
            await new Promise((r) => setTimeout(r, 300))
            try {
              await audio.play()
              playSucceeded = true
              setState("speaking")
              setStatusText("")
            } catch {
              playSucceeded = false
            }
          }
        }

        if (!playSucceeded) {
          stopTTSMonitor()
          URL.revokeObjectURL(url)
          audioPlayerRef.current = null

          if (isMobileRef.current) {
            setState("speaking")
            setStatusText("")
            const webSpeechOk = await tryWebSpeechFallback(text)
            if (webSpeechOk) {
              await afterSpeak()
              return
            }
          }

          await afterSpeak()
          return
        }

        await finished
        await afterSpeak()
      } catch (err) {
        stopTTSMonitor()
        if (err instanceof Error && err.name === "AbortError") {
          resetToIdle()
          return
        }

        if (isMobileRef.current) {
          setState("speaking")
          setStatusText("")
          const webSpeechOk = await tryWebSpeechFallback(text)
          if (webSpeechOk) {
            await afterSpeak()
            return
          }
        }

        setError("Voice response unavailable — see text above")
        await afterSpeak()
      } finally {
        isTransitioningRef.current = false
      }
    },
    [startTTSMonitor, stopTTSMonitor, resetToIdle, getSmoothedAdaptation],
  )

  /* ── getAIResponse ──────────────────────────────────────────────────────── */

  const getAIResponse = useCallback(async () => {
    cancelAbort()
    setState("thinking")
    setStatusText("Thinking...")
    setAgentSteps([]) // Clear previous agent steps
    const ctrl = freshAbort()

    const MAX_RETRIES = 2
    let attempt = 0

    while (attempt < MAX_RETRIES) {
      attempt++
      try {
        // Only send image on the LAST user message; strip from older ones
        // to avoid bloating the payload with stale base64 data
        const msgs = conversationRef.current.map((m, i, arr) => {
          const isLastUserMsg = m.role === 'user' && i === arr.map(x => x.role).lastIndexOf('user')
          return {
            role: m.role,
            content: m.content,
            image: isLastUserMsg ? m.image : undefined,
          }
        })

        const adaptation = getSmoothedAdaptation()
        const emotionSuffix = adaptation.systemPromptSuffix
          ? `\n\nEMOTION CONTEXT:\n${adaptation.systemPromptSuffix}`
          : ''

        const res = await fetchWithTimeout(
          "/api/v1/chat-stream",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: msgs,
              personality: personalityRef.current,
              customPrompt: customPromptRef?.current,
              memories: (memoriesRef?.current || "") + emotionSuffix,
              // BUG-H1 fix: only enable EDITH mode when the user has explicitly turned
              // it on. Previously hardcoded true, which always injected the full EDITH
              // system prompt (autonomous execution, Hinglish tone, tool chaining) even
              // for simple one-off voice queries — increasing token cost and causing
              // unexpectedly aggressive autonomous behaviour.
              voiceMode: edithModeRef.current,
              voiceDurationMs: lastRecordingDurationMsRef.current || undefined,
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

        if (!res.ok) {
          let errMsg = `Error ${res.status}`
          try {
            const errData = await res.json()
            if (errData.error) errMsg = errData.error
          } catch {}
          throw new Error(errMsg)
        }

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
              // ── Agentic step event ──
              if (p.agentStep) {
                setAgentSteps(prev => {
                  const existing = prev.findIndex(s => s.toolName === p.agentStep.toolName)
                  if (existing >= 0) {
                    const updated = [...prev]
                    updated[existing] = p.agentStep
                    return updated
                  }
                  return [...prev, p.agentStep]
                })
              }
              // ── EDITH: needsInput event — auto-restart recording after TTS ──
              if (p.needsInput) {
                expectingResponseRef.current = true
              }
            } catch {}
          }
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

        // Strip image from the user message that triggered this
        for (let ci = conversationRef.current.length - 1; ci >= 0; ci--) {
          if (conversationRef.current[ci].role === 'user' && conversationRef.current[ci].image) {
            conversationRef.current[ci].image = undefined
            break
          }
        }

        conversationRef.current.push({ role: "assistant", content: full })
        if (conversationRef.current.length > 14) {
          conversationRef.current = conversationRef.current.slice(-14)
        }

        // Auto-save memory (fire-and-forget)
        if (userId && conversationRef.current.length >= 4) {
          const memInteractionCount = conversationRef.current.filter(m => m.role === "user").length
          const memConvo = conversationRef.current.map(m => ({ role: m.role, content: m.content }))
          const payload = JSON.stringify({
            conversation: memConvo,
            interactionCount: memInteractionCount,
          })
          fetch("/api/v1/memory", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: payload,
          }).catch(() => {})
        }

        // Clear agent steps after response completes
        setAgentSteps([])

        // Speak the full response — simple, reliable, no stream interruption
        if (shouldUseTTS(full, true)) {
          const ttsText = truncateForTTS(full)
          await fnRef.current.speakText(ttsText)
        } else {
          // EDITH mode: always restart recording; also restart for follow-ups or continuous
          if (edithModeRef.current || expectingResponseRef.current || continuousRef.current) {
            expectingResponseRef.current = false
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
        setError(`Failed: ${err instanceof Error ? err.message : String(err)}`)
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

  /** Track consecutive STT failures to break out of the listen→fail→listen loop */
  const sttFailCountRef = useRef(0)
  const MAX_STT_RETRIES_CLIENT = 3

  const transcribeAudio = useCallback(
    async (blob: Blob) => {
      cancelAbort()
      setState("transcribing")
      setStatusText("Processing...")
      const ctrl = freshAbort()

      try {
        // iOS Safari may produce blobs with empty or wrong MIME types.
        // Detect the actual type and create a proper File with correct extension.
        let mimeType = blob.type || "audio/webm"
        // Safari on iOS often records as audio/mp4 but sometimes reports video/mp4
        if (mimeType.startsWith("video/")) mimeType = mimeType.replace("video/", "audio/")
        if (!mimeType.startsWith("audio/")) mimeType = "audio/webm"

        const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm"
        const file = new File([blob], `recording.${ext}`, { type: mimeType })

        const fd = new FormData()
        fd.append("audio", file)

        const res = await fetchWithTimeout(
          "/api/v1/stt",
          { method: "POST", body: fd, signal: ctrl.signal },
          STT_TIMEOUT,
        )
        if (!res.ok) {
          // Log the server error detail for debugging
          try {
            const errData = await res.json()
            console.error("[STT] Server error:", res.status, errData.detail || errData.error)
          } catch {}
          throw new Error(`STT failed: ${res.status}`)
        }

        // Success — reset fail counter
        sttFailCountRef.current = 0

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

        let imageToAttach = undefined
        if (imagePayloadRef && imagePayloadRef.current) {
          imageToAttach = imagePayloadRef.current
          imagePayloadRef.current = null
          if (onImageConsumed) onImageConsumed()
        }

        setLastTranscript(text)
        conversationRef.current.push({ role: "user", content: text, image: imageToAttach })
        await fnRef.current.getAIResponse()
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          resetToIdle()
          return
        }
        if (continuousRef.current) {
          sttFailCountRef.current++
          if (sttFailCountRef.current >= MAX_STT_RETRIES_CLIENT) {
            // Too many consecutive failures — break out of the loop
            sttFailCountRef.current = 0
            continuousRef.current = false
            setError("Voice transcription unavailable — please try again later")
            resetToIdle()
          } else {
            setError("Transcription hiccup \u2014 listening again...")
            await new Promise(r => setTimeout(r, 800)) // brief delay before retry
            await fnRef.current.startRecording()
          }
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
      setLastResponse("")
      audioChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 16000 }, // 16kHz is optimal for speech recognition
        },
      })
      streamRef.current = stream
      startAudioMonitor(stream)

      const mime = getBestAudioMimeType() || "audio/mp4" // Safari fallback
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, { mimeType: mime })
      } catch {
        // Some iOS versions don't support mimeType option — use default
        recorder = new MediaRecorder(stream)
      }
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        // Capture recording duration for time-based voice tracking
        lastRecordingDurationMsRef.current = recordingStartRef.current > 0
          ? Date.now() - recordingStartRef.current
          : 0
        recordingStartRef.current = 0

        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        stopAudioMonitor()

        // If cancelAll() was called (sets continuousRef=false + resetToIdle),
        // the recorder fires onstop asynchronously AFTER reset. Bail out to
        // prevent re-entering the transcription/recording flow.
        if (!continuousRef.current && stateRef.current === "idle") {
          return
        }

        const actualMime = recorder.mimeType || mime || "audio/mp4"
        const blob = new Blob(audioChunksRef.current, { type: actualMime })
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
      recordingStartRef.current = Date.now()
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

  // BUG-M1 fix: debounce rapid taps. Two fast taps both see state="idle" (React
  // state, read synchronously) before the first startRecording() updates it.
  // isTransitioningRef blocks the second startRecording body, but continuousRef
  // was still being set twice. A 150ms guard prevents duplicate dispatch.
  const lastTapTimeRef = useRef(0)

  const handleTap = useCallback(() => {
    const now = Date.now()
    if (now - lastTapTimeRef.current < 150) return
    lastTapTimeRef.current = now

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
      setStatusText("Loading voice...")
      const ctrl = freshAbort()

      /** After greeting, always enter continuous recording */
      const afterGreet = async () => {
        conversationRef.current.push({ role: "assistant", content: text })
        continuousRef.current = true
        await fnRef.current.startRecording()
      }

      try {
        const res = await fetchWithTimeout(
          "/api/v1/tts",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: ctrl.signal,
          },
          TTS_TIMEOUT,
        )
        if (!res.ok) {
          // TTS API failed — try Web Speech fallback on mobile
          if (isMobileRef.current) {
            try {
              setState("speaking")
              setStatusText("")
              await speakWithWebSpeechAPI(text)
              await afterGreet()
              return
            } catch {}
          }
          // Skip greeting audio, still enter recording
          await afterGreet()
          return
        }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        if (audioPlayerRef.current) audioPlayerRef.current.pause()
        const audio = new Audio(url)
        audio.volume = 1.0
        // MOBILE FIX: preload + playsinline attributes
        audio.preload = 'auto'
        audio.setAttribute('playsinline', 'true')
        audio.setAttribute('webkit-playsinline', 'true')
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

        let playSucceeded = false
        try {
          await audio.play()
          playSucceeded = true
          setState("speaking")
          setStatusText("")
        } catch {
          if (isMobileRef.current) {
            // MOBILE FIX: Skip retry, go straight to Web Speech fallback
            playSucceeded = false
          } else {
            // Desktop: retry once after short delay
            await new Promise((r) => setTimeout(r, 300))
            try {
              await audio.play()
              playSucceeded = true
              setState("speaking")
              setStatusText("")
            } catch {
              playSucceeded = false
            }
          }
        }

        if (!playSucceeded) {
          // ElevenLabs audio blocked — clean up and try Web Speech
          stopTTSMonitor()
          URL.revokeObjectURL(url)
          audioPlayerRef.current = null

          if (isMobileRef.current) {
            try {
              setState("speaking")
              setStatusText("")
              await speakWithWebSpeechAPI(text)
            } catch {}
          }

          await afterGreet()
          return
        }

        // ElevenLabs played successfully
        conversationRef.current.push({ role: "assistant", content: text })
        await finished

        // After greeting, enter continuous recording
        continuousRef.current = true
        await fnRef.current.startRecording()
      } catch {
        // Network error or timeout — try Web Speech fallback
        if (isMobileRef.current) {
          try {
            setState("speaking")
            setStatusText("")
            await speakWithWebSpeechAPI(text)
            await afterGreet()
            return
          } catch {}
        }
        // Last resort: skip audio, enter recording
        await afterGreet()
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
  }, [userId, conversationRef]) // BUG-010 fix: removed unused memoriesRef from deps

  /* ── Keep fnRef in sync after every render ──────────────────────────────── */

  useEffect(() => {
    fnRef.current = {
      startRecording,
      transcribeAudio,
      getAIResponse,
      speakText,
    }
  })

  useEffect(() => {
    return () => {
      cancelAll()
    }
  }, [cancelAll])

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
    agentSteps,
    /** Get duration of the last voice recording in ms (for billing) */
    getLastRecordingDurationMs: () => lastRecordingDurationMsRef.current,
  }
}
