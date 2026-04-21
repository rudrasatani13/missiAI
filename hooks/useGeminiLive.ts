"use client"

import { useCallback, useEffect, useRef, useState } from "react"

// ─── Types ─────────────────────────────────────────────────────────────────────

export type LiveState = "disconnected" | "connecting" | "connected" | "speaking" | "error"

export interface GeminiLiveConfig {
  systemPrompt: string
  voiceName?: string // Default: "Kore"
  /** Tool declarations for Gemini Live — enables agent tools in real-time voice */
  toolDeclarations?: Array<{ name: string; description: string; parameters: Record<string, unknown> }>
  onTranscriptIn?: (text: string) => void   // What user said
  onTranscriptOut?: (text: string) => void  // What Gemini said
  onStateChange?: (state: LiveState) => void
  onError?: (error: string) => void
  onAudioLevel?: (level: number) => void
  /** Called when Gemini invokes a tool — caller must execute and call sendToolResponse */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => void
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const AUDIO_SAMPLE_RATE_IN = 16000   // What we send (mic)
const AUDIO_SAMPLE_RATE_OUT = 24000  // What we receive (model)

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useGeminiLive(config: GeminiLiveConfig) {
  const [state, setState] = useState<LiveState>("disconnected")
  const [error, setError] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const micCtxRef = useRef<AudioContext | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const nextPlayTimeRef = useRef(0)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const isConnectedRef = useRef(false)
  const outputTranscriptRef = useRef("")
  const setupCompleteRef = useRef(false)
  const turnCompleteTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Refs for callbacks to avoid stale closures
  const configRef = useRef(config)
  configRef.current = config

  const updateState = useCallback((s: LiveState) => {
    setState(s)
    configRef.current.onStateChange?.(s)
  }, [])

  // ── Parse incoming WebSocket message (handles both string and Blob) ────────

  const parseWsMessage = useCallback(async (event: MessageEvent): Promise<any> => {
    let raw = event.data
    // Browser WebSockets return Blob for binary frames — convert to text
    if (raw instanceof Blob) {
      raw = await raw.text()
    }
    return JSON.parse(raw)
  }, [])

  // ── Play PCM audio chunk ───────────────────────────────────────────────────

  const playPcmChunk = useCallback((base64Data: string) => {
    const audioCtx = audioCtxRef.current
    const analyser = analyserRef.current
    if (!audioCtx || !analyser) return

    // Decode base64 → ArrayBuffer
    const binaryStr = atob(base64Data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)

    // Convert Int16 PCM → Float32
    const int16 = new Int16Array(bytes.buffer)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768
    }

    // Create AudioBuffer and schedule playback
    const buffer = audioCtx.createBuffer(1, float32.length, AUDIO_SAMPLE_RATE_OUT)
    buffer.copyToChannel(float32, 0)

    const source = audioCtx.createBufferSource()
    source.buffer = buffer
    source.connect(analyser)

    // Schedule gapless playback — play IMMEDIATELY if no audio is queued
    const now = audioCtx.currentTime
    const startTime = Math.max(now, nextPlayTimeRef.current)
    source.start(startTime)
    nextPlayTimeRef.current = startTime + buffer.duration
  }, [])

  // ── Audio level monitoring for visualizer ──────────────────────────────────

  const startAudioMonitor = useCallback(() => {
    const monitor = () => {
      const analyser = analyserRef.current
      if (!analyser || !isConnectedRef.current) return

      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i]
      const rms = Math.sqrt(sum / data.length) / 255
      configRef.current.onAudioLevel?.(Math.min(1, rms * 4))

      animFrameRef.current = requestAnimationFrame(monitor)
    }
    monitor()
  }, [])

  // ── Start streaming mic audio to WebSocket ─────────────────────────────────

  const startMicStreaming = useCallback((ws: WebSocket, micCtx: AudioContext, stream: MediaStream) => {
    const source = micCtx.createMediaStreamSource(stream)
    // Small buffer = more frequent packets = lower latency
    const processor = micCtx.createScriptProcessor(1024, 1, 1)

    processor.onaudioprocess = (e) => {
      if (!isConnectedRef.current || ws.readyState !== WebSocket.OPEN || !setupCompleteRef.current) return
      const float32 = e.inputBuffer.getChannelData(0)

      // Convert float32 to int16 PCM
      const int16 = new Int16Array(float32.length)
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]))
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }

      // Send as base64 — Gemini's server-side VAD handles turn detection
      // BUG-H2 fix: use Array.from + join instead of character-by-character
      // string concatenation. The old loop was O(n²) — each += allocates a new
      // string, causing micro-stutters in the hot audio encoding path (~15Hz).
      const bytes = new Uint8Array(int16.buffer)
      const b64 = btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(""))

      ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            data: b64,
            mimeType: "audio/pcm;rate=16000",
          }
        },
      }))
    }

    source.connect(processor)
    processor.connect(micCtx.destination)
    sourceNodeRef.current = source
    processorRef.current = processor
  }, [])

  // ── Connect ────────────────────────────────────────────────────────────────

  const connect = useCallback(async () => {
    if (isConnectedRef.current) return
    updateState("connecting")
    setError(null)
    setupCompleteRef.current = false

    // Create AudioContexts synchronously during click to satisfy browser "user gesture" requirement
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE_OUT })
    }
    if (!micCtxRef.current || micCtxRef.current.state === "closed") {
      micCtxRef.current = new AudioContextClass({ sampleRate: AUDIO_SAMPLE_RATE_IN })
    }
    const audioCtx = audioCtxRef.current
    const micCtx = micCtxRef.current

    // Resume suspended contexts (Safari requires this)
    if (audioCtx.state === "suspended") await audioCtx.resume()
    if (micCtx.state === "suspended") await micCtx.resume()

    try {
      // 1. Get WebSocket URL from our backend
      const tokenRes = await fetch("/api/v1/live-token", { method: "POST" })
      if (!tokenRes.ok) {
        const errData = await tokenRes.json().catch(() => ({})) as { code?: string; error?: string }
        // Handle Pro-only gate
        if (tokenRes.status === 403 && errData.code === "PRO_REQUIRED") {
          throw new Error("PRO_REQUIRED")
        }
        throw new Error(errData.error || "Failed to get live token")
      }
      const { wsUrl, modelPath } = await tokenRes.json() as { wsUrl: string; modelPath: string }

      // 2. Create analyser for visualizer
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      analyser.connect(audioCtx.destination)
      analyserRef.current = analyser

      // 3. Get mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: AUDIO_SAMPLE_RATE_IN,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      mediaStreamRef.current = stream

      // 4. Open WebSocket
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      // ★ CRITICAL: Set message handler BEFORE open, so we never miss setupComplete
      ws.onmessage = async (event) => {
        try {
          const msg = await parseWsMessage(event)

          // setupComplete — server accepted our config
          if (msg.setupComplete !== undefined) {
            setupCompleteRef.current = true
            updateState("connected")
            // Start streaming mic NOW that setup is confirmed
            startMicStreaming(ws, micCtx, stream)
            return
          }

          // Audio from model
          if (msg.serverContent?.modelTurn?.parts) {
            for (const part of msg.serverContent.modelTurn.parts) {
              if (part.inlineData?.data) {
                if (turnCompleteTimeoutRef.current) clearTimeout(turnCompleteTimeoutRef.current)
                updateState("speaking")
                playPcmChunk(part.inlineData.data)
              }
            }
          }

          // Turn finished — model done talking
          if (msg.serverContent?.turnComplete) {
            outputTranscriptRef.current = ""
            
            // Wait for audio queue to finish playing before going back to listening state
            const now = audioCtxRef.current?.currentTime || 0
            const delaySec = Math.max(0, nextPlayTimeRef.current - now)
            
            if (turnCompleteTimeoutRef.current) clearTimeout(turnCompleteTimeoutRef.current)
            turnCompleteTimeoutRef.current = setTimeout(() => {
              updateState("connected")
            }, delaySec * 1000)
          }

          // Input transcription (what user said)
          if (msg.serverContent?.inputTranscription?.text) {
            configRef.current.onTranscriptIn?.(msg.serverContent.inputTranscription.text)
          }

          // Output transcription (what model said)
          if (msg.serverContent?.outputTranscription?.text) {
            outputTranscriptRef.current += msg.serverContent.outputTranscription.text
            configRef.current.onTranscriptOut?.(outputTranscriptRef.current)
          }

          // Tool call from model — execute via /api/v1/tools/execute
          // BUG-C1 fix: Gemini Live requires ALL function responses for a single toolCall
          // to be sent together in ONE toolResponse message. Sending separate messages per
          // tool causes the model to stall waiting for remaining responses.
          if (msg.toolCall?.functionCalls) {
            for (const fc of msg.toolCall.functionCalls) {
              configRef.current.onToolCall?.(fc.name, fc.args || {})
            }

            // Execute all tools in parallel, then send one batched toolResponse
            const functionResponses = await Promise.all(
              msg.toolCall.functionCalls.map(async (fc: { id?: string; name: string; args?: Record<string, unknown> }) => {
                try {
                  const toolRes = await fetch("/api/v1/tools/execute", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: fc.name, args: fc.args || {} }),
                  })
                  const toolResult = await toolRes.json() as {
                    output?: string
                    summary?: string
                    status?: string
                    error?: string
                    success?: boolean
                  }
                  const toolMessage = toolResult.success === false
                    ? (toolResult.error || "Tool execution failed")
                    : (toolResult.output || toolResult.summary || "Done")
                  return {
                    name: fc.name,
                    response: { result: toolMessage },
                  }
                } catch (toolErr) {
                  console.error("[GeminiLive] Tool execution error:", fc.name, toolErr)
                  return {
                    name: fc.name,
                    response: { result: "Tool execution failed" },
                  }
                }
              })
            )

            // Send all responses in a single message as required by the Gemini Live protocol
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ toolResponse: { functionResponses } }))
            }
          }

          // Interrupted — user spoke while model was talking
          if (msg.serverContent?.interrupted) {
            if (turnCompleteTimeoutRef.current) clearTimeout(turnCompleteTimeoutRef.current)
            updateState("connected")
            // Stop any queued audio
            nextPlayTimeRef.current = 0
          }
        } catch (err) {
          console.error("[GeminiLive] Failed to parse message:", err)
        }
      }

      ws.onerror = (ev) => {
        console.error("[GeminiLive] WebSocket error:", ev)
        setError("WebSocket connection error")
        updateState("error")
      }

      ws.onclose = (_ev) => {
        isConnectedRef.current = false
        setupCompleteRef.current = false
        updateState("disconnected")
        
        // Ensure mic stops if the connection drops unexpectedly
        if (mediaStreamRef.current) {
          mediaStreamRef.current.getTracks().forEach((t) => t.stop())
          mediaStreamRef.current = null
        }
      }

      ws.onopen = () => {
        isConnectedRef.current = true

        // Build tools array for Gemini Live
        const liveTools: Record<string, unknown>[] = [{ google_search: {} }]
        if (configRef.current.toolDeclarations && configRef.current.toolDeclarations.length > 0) {
          liveTools.push({
            function_declarations: configRef.current.toolDeclarations,
          })
        }

        // Send setup config with server-side VAD for instant turn detection
        ws.send(JSON.stringify({
          setup: {
            model: modelPath,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: configRef.current.voiceName || "Kore",
                  },
                },
              },
            },
            // Enable Gemini's built-in server-side Voice Activity Detection
            // This detects when user stops speaking and triggers response INSTANTLY
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                // Start listening immediately, don't wait for speech to begin
                startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
                // Respond quickly after user stops (300ms silence = turn done)
                endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
              },
            },
            // Agent tools for EDITH mode
            tools: liveTools,
            systemInstruction: {
              parts: [{ text: configRef.current.systemPrompt }],
            },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
        }))
      }

      // Start audio level monitoring
      startAudioMonitor()

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[GeminiLive] Connect error:", msg)
      setError(msg)
      updateState("error")
      configRef.current.onError?.(msg)
    }
  }, [updateState, parseWsMessage, playPcmChunk, startAudioMonitor, startMicStreaming])

  // ── Disconnect ─────────────────────────────────────────────────────────────

  const disconnect = useCallback(() => {
    isConnectedRef.current = false
    setupCompleteRef.current = false

    // Stop animation
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }

    if (turnCompleteTimeoutRef.current) {
      clearTimeout(turnCompleteTimeoutRef.current)
      turnCompleteTimeoutRef.current = null
    }

    // Disconnect processor
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Stop mic
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop())
      mediaStreamRef.current = null
    }

    // Close audio contexts
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    if (micCtxRef.current) {
      micCtxRef.current.close().catch(() => {})
      micCtxRef.current = null
    }

    analyserRef.current = null
    nextPlayTimeRef.current = 0
    updateState("disconnected")
    configRef.current.onAudioLevel?.(0)
  }, [updateState])

  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    state,
    error,
    connect,
    disconnect,
  }
}
