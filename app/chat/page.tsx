"use client"
export const runtime = "edge"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Settings, Mic, MicOff, Volume2, VolumeX, LogOut, X } from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"

/* ─────────────────────────────────────────────────
   Types & State Machine
   ───────────────────────────────────────────────── */
type VoiceState = "idle" | "recording" | "transcribing" | "thinking" | "speaking"

interface ConversationEntry {
  role: "user" | "assistant"
  content: string
}

/* ─────────────────────────────────────────────────
   Starfield Canvas
   ───────────────────────────────────────────────── */
function StarfieldBg() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let animId: number
    let stars: { x: number; y: number; s: number; b: number; sp: number; off: number }[] = []

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      stars = Array.from({ length: 120 }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        s: Math.random() * 1.2 + 0.3, b: Math.random() * 0.4 + 0.1,
        sp: Math.random() * 0.002 + 0.0005, off: Math.random() * Math.PI * 2,
      }))
    }

    const draw = (t: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const star of stars) {
        const alpha = star.b * (0.6 + 0.4 * Math.sin(t * star.sp + star.off))
        ctx.fillStyle = `rgba(255,255,255,${alpha})`
        ctx.beginPath()
        ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2)
        ctx.fill()
      }
      animId = requestAnimationFrame(draw)
    }

    resize()
    animId = requestAnimationFrame(draw)
    window.addEventListener("resize", resize)
    return () => { cancelAnimationFrame(animId); window.removeEventListener("resize", resize) }
  }, [])

  return <canvas ref={canvasRef} className="fixed inset-0 w-full h-full" />
}

/* ─────────────────────────────────────────────────
   Animated Voice Orb
   ───────────────────────────────────────────────── */
function VoiceOrb({ state, onClick }: { state: VoiceState; onClick: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const size = 200
    canvas.width = size
    canvas.height = size
    let animId: number

    const draw = (t: number) => {
      ctx.clearRect(0, 0, size, size)
      const cx = size / 2
      const cy = size / 2

      // Outer glow
      const glowRadius = state === "recording" ? 85 + Math.sin(t * 0.003) * 8 :
        state === "speaking" ? 82 + Math.sin(t * 0.004) * 10 :
        state === "thinking" || state === "transcribing" ? 80 + Math.sin(t * 0.005) * 5 : 78

      const glowAlpha = state === "recording" ? 0.15 :
        state === "speaking" ? 0.12 : state === "idle" ? 0.04 : 0.08

      const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, glowRadius)

      if (state === "recording") {
        grad.addColorStop(0, `rgba(239,68,68,${glowAlpha + 0.1})`)
        grad.addColorStop(0.5, `rgba(239,68,68,${glowAlpha})`)
        grad.addColorStop(1, "transparent")
      } else if (state === "speaking") {
        grad.addColorStop(0, `rgba(255,255,255,${glowAlpha + 0.08})`)
        grad.addColorStop(0.5, `rgba(200,220,255,${glowAlpha})`)
        grad.addColorStop(1, "transparent")
      } else if (state === "thinking" || state === "transcribing") {
        grad.addColorStop(0, `rgba(255,255,255,${glowAlpha + 0.05})`)
        grad.addColorStop(0.5, `rgba(255,255,255,${glowAlpha})`)
        grad.addColorStop(1, "transparent")
      } else {
        grad.addColorStop(0, `rgba(255,255,255,${glowAlpha + 0.03})`)
        grad.addColorStop(1, "transparent")
      }

      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)

      // Core circle
      const baseRadius = 42
      const coreRadius = state === "recording" ? baseRadius + 3 + Math.sin(t * 0.006) * 4 :
        state === "speaking" ? baseRadius + 2 + Math.sin(t * 0.005) * 5 :
        state === "thinking" || state === "transcribing" ? baseRadius + Math.sin(t * 0.008) * 2 : baseRadius

      ctx.beginPath()
      ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2)

      if (state === "recording") {
        ctx.fillStyle = "rgba(239,68,68,0.12)"
        ctx.fill()
        ctx.strokeStyle = "rgba(239,68,68,0.5)"
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (state === "speaking") {
        ctx.fillStyle = "rgba(255,255,255,0.08)"
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.35)"
        ctx.lineWidth = 2
        ctx.stroke()
      } else if (state === "thinking" || state === "transcribing") {
        ctx.fillStyle = "rgba(255,255,255,0.04)"
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.15)"
        ctx.lineWidth = 1.5
        ctx.stroke()
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.03)"
        ctx.fill()
        ctx.strokeStyle = "rgba(255,255,255,0.12)"
        ctx.lineWidth = 1
        ctx.stroke()
      }

      // Waveform ring (recording & speaking)
      if (state === "recording" || state === "speaking") {
        const waveCount = state === "recording" ? 48 : 64
        const waveRadius = coreRadius + 12
        for (let i = 0; i < waveCount; i++) {
          const angle = (i / waveCount) * Math.PI * 2
          const wave = Math.sin(angle * 6 + t * 0.004) * (state === "recording" ? 8 : 12)
            + Math.sin(angle * 3 + t * 0.003) * 4
          const r1 = waveRadius
          const r2 = waveRadius + Math.abs(wave)
          const x1 = cx + Math.cos(angle) * r1
          const y1 = cy + Math.sin(angle) * r1
          const x2 = cx + Math.cos(angle) * r2
          const y2 = cy + Math.sin(angle) * r2
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.strokeStyle = state === "recording"
            ? `rgba(239,68,68,${0.2 + Math.abs(wave) / 20})`
            : `rgba(255,255,255,${0.15 + Math.abs(wave) / 25})`
          ctx.lineWidth = 1.5
          ctx.lineCap = "round"
          ctx.stroke()
        }
      }

      // Spinning ring (thinking/transcribing)
      if (state === "thinking" || state === "transcribing") {
        const spinAngle = t * 0.003
        const arcLen = Math.PI * 0.7
        ctx.beginPath()
        ctx.arc(cx, cy, coreRadius + 10, spinAngle, spinAngle + arcLen)
        ctx.strokeStyle = "rgba(255,255,255,0.25)"
        ctx.lineWidth = 2
        ctx.lineCap = "round"
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(cx, cy, coreRadius + 10, spinAngle + Math.PI, spinAngle + Math.PI + arcLen * 0.5)
        ctx.strokeStyle = "rgba(255,255,255,0.12)"
        ctx.lineWidth = 1.5
        ctx.stroke()
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [state])

  const isClickable = state === "idle" || state === "recording" || state === "speaking"

  return (
    <button
      onClick={onClick}
      disabled={!isClickable}
      className="relative transition-transform duration-300"
      style={{
        cursor: isClickable ? "pointer" : "default",
        transform: isClickable ? "scale(1)" : "scale(0.98)",
        outline: "none", border: "none", background: "transparent",
      }}
    >
      <canvas ref={canvasRef} width={200} height={200} className="w-[200px] h-[200px]" />

      {/* Center icon */}
      <div className="absolute inset-0 flex items-center justify-center">
        {state === "recording" ? (
          <div className="w-5 h-5 rounded-sm bg-red-400/80" />
        ) : state === "thinking" || state === "transcribing" ? (
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-1.5 h-1.5 rounded-full" style={{
                background: "rgba(255,255,255,0.5)",
                animation: `dotPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
              }} />
            ))}
          </div>
        ) : state === "speaking" ? (
          <Volume2 className="w-6 h-6" style={{ color: "rgba(255,255,255,0.6)" }} />
        ) : (
          <Mic className="w-7 h-7" style={{ color: "rgba(255,255,255,0.5)" }} />
        )}
      </div>
    </button>
  )
}

/* ─────────────────────────────────────────────────
   MAIN VOICE ASSISTANT PAGE
   ───────────────────────────────────────────────── */
export default function Page() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [statusText, setStatusText] = useState("Tap to speak")
  const [lastTranscript, setLastTranscript] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const { user } = useUser()
  const { signOut } = useClerk()

  // Conversation history (hidden from UI, used for context)
  const conversationRef = useRef<ConversationEntry[]>([])
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  /* ══════════════════════════════════════════════
     CORE VOICE FLOW
     1. Record → 2. Transcribe (STT) → 3. Think (Gemini) → 4. Speak (TTS)
     ══════════════════════════════════════════════ */

  /* ── Step 1: Start Recording ─── */
  const startRecording = useCallback(async () => {
    try {
      // Stop any current speech
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }

      setVoiceState("recording")
      setStatusText("Listening...")
      setError(null)
      setLastTranscript("")
      audioChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus" : "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })

        if (audioBlob.size < 500) {
          setVoiceState("idle")
          setStatusText("Too short — try again")
          setTimeout(() => setStatusText("Tap to speak"), 2000)
          return
        }

        // Step 2: Transcribe
        await transcribeAudio(audioBlob)
      }

      recorder.start(100)
    } catch (err) {
      console.error("Mic error:", err)
      setError("Microphone access denied. Please allow permissions.")
      setVoiceState("idle")
      setStatusText("Tap to speak")
    }
  }, [])

  /* ── Step 2: Transcribe via ElevenLabs STT ─── */
  const transcribeAudio = useCallback(async (audioBlob: Blob) => {
    setVoiceState("transcribing")
    setStatusText("Processing your voice...")

    try {
      const formData = new FormData()
      formData.append("audio", audioBlob, "recording.webm")

      const res = await fetch("/api/stt", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) throw new Error("Transcription failed")

      const data = await res.json()
      const transcript = data.text?.trim()

      if (!transcript) {
        setVoiceState("idle")
        setStatusText("Didn't catch that — try again")
        setTimeout(() => setStatusText("Tap to speak"), 2500)
        return
      }

      setLastTranscript(transcript)

      // Add to conversation history
      conversationRef.current.push({ role: "user", content: transcript })

      // Step 3: Get AI response
      await getAIResponse(transcript)
    } catch (err) {
      console.error("STT error:", err)
      setError("Couldn't process your voice. Try again.")
      setVoiceState("idle")
      setStatusText("Tap to speak")
    }
  }, [])

  /* ── Step 3: Get response from Gemini ─── */
  const getAIResponse = useCallback(async (userText: string) => {
    setVoiceState("thinking")
    setStatusText("Thinking...")

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const messages = conversationRef.current.map((m) => ({
        role: m.role, content: m.content,
      }))

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages }),
        signal: controller.signal,
      })

      if (!response.ok) throw new Error(`Server error: ${response.status}`)

      const reader = response.body?.getReader()
      if (!reader) throw new Error("No response stream")

      const decoder = new TextDecoder()
      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          const data = line.slice(6).trim()
          if (data === "[DONE]") continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.text) fullText += parsed.text
          } catch {
            // skip malformed
          }
        }
      }

      if (!fullText.trim()) {
        setVoiceState("idle")
        setStatusText("No response — try again")
        setTimeout(() => setStatusText("Tap to speak"), 2500)
        return
      }

      // Add to conversation history
      conversationRef.current.push({ role: "assistant", content: fullText })

      // Keep conversation manageable (last 20 entries)
      if (conversationRef.current.length > 20) {
        conversationRef.current = conversationRef.current.slice(-20)
      }

      // Step 4: Speak the response
      await speakResponse(fullText)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setVoiceState("idle")
        setStatusText("Tap to speak")
        return
      }
      console.error("AI error:", err)
      setError("Couldn't get a response. Try again.")
      setVoiceState("idle")
      setStatusText("Tap to speak")
    }
  }, [])

  /* ── Step 4: Speak via ElevenLabs TTS ─── */
  const speakResponse = useCallback(async (text: string) => {
    setVoiceState("speaking")
    setStatusText("Speaking...")

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) throw new Error("TTS failed")

      const audioBlob = await res.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
      }

      const audio = new Audio(audioUrl)
      audioPlayerRef.current = audio

      audio.onended = () => {
        setVoiceState("idle")
        setStatusText("Tap to speak")
        URL.revokeObjectURL(audioUrl)
        audioPlayerRef.current = null
      }

      audio.onerror = () => {
        setVoiceState("idle")
        setStatusText("Tap to speak")
        URL.revokeObjectURL(audioUrl)
        audioPlayerRef.current = null
      }

      await audio.play()
    } catch (err) {
      console.error("TTS error:", err)
      // Fallback: just go back to idle
      setVoiceState("idle")
      setStatusText("Tap to speak")
    }
  }, [])

  /* ── Stop everything ─── */
  const stopAll = useCallback(() => {
    // Stop recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop()
    }
    // Stop audio playback
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause()
      audioPlayerRef.current = null
    }
    // Stop AI request
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    // Stop mic stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }

    setVoiceState("idle")
    setStatusText("Tap to speak")
  }, [])

  /* ── Orb click handler ─── */
  const handleOrbClick = useCallback(() => {
    switch (voiceState) {
      case "idle":
        startRecording()
        break
      case "recording":
        // Stop recording — this triggers onstop → transcribe → AI → speak
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop()
          setStatusText("Processing...")
        }
        break
      case "speaking":
        stopAll()
        break
      default:
        break
    }
  }, [voiceState, startRecording, stopAll])

  /* ── Keyboard shortcut (spacebar) ─── */
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) {
        e.preventDefault()
        handleOrbClick()
      }
      if (e.code === "Escape") {
        stopAll()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [handleOrbClick, stopAll])

  /* ── Cleanup on unmount ─── */
  useEffect(() => {
    return () => {
      stopAll()
    }
  }, [stopAll])

  const handleLogout = useCallback(async () => {
    stopAll()
    await signOut({ redirectUrl: "/" })
  }, [signOut, stopAll])

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

      <StarfieldBg />

      {/* ─── Top Nav ─── */}
      <nav className="relative z-20 flex items-center justify-between px-5 md:px-8 py-4">
        <Link href="/" className="flex items-center gap-2 opacity-50 hover:opacity-80 transition-opacity">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-light hidden sm:inline">Home</span>
        </Link>

        <Image src="/images/logo-symbol.png" alt="missiAI" width={32} height={32}
          className="w-7 h-7 opacity-50 pointer-events-none"
          priority draggable={false} />

        <button onClick={() => setShowSettings(!showSettings)}
          className="opacity-50 hover:opacity-80 transition-opacity"
          style={{ background: "none", border: "none", cursor: "pointer", color: "white" }}>
          {showSettings ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
        </button>
      </nav>

      {/* ─── Settings Panel ─── */}
      {showSettings && (
        <div className="absolute top-16 right-5 z-30 w-56 rounded-2xl p-4"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(20px)" }}>
          <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            {user?.imageUrl && (
              <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full opacity-80" />
            )}
            <div>
              <p className="text-xs font-medium text-white/80">{user?.fullName || "User"}</p>
              <p className="text-[10px] font-light text-white/30">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-light transition-colors hover:bg-white/5"
            style={{ color: "rgba(255,255,255,0.5)", background: "none", border: "none", cursor: "pointer" }}>
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      )}

      {/* ─── Main Voice Interface ─── */}
      <div className="relative z-10 flex flex-col items-center justify-center" style={{ height: "calc(100vh - 70px)" }}>

        {/* Greeting */}
        <div className="text-center mb-10" style={{ animation: "fadeIn 0.8s ease-out both" }}>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight mb-1">
            {voiceState === "idle"
              ? `Hey${user?.firstName ? `, ${user.firstName}` : ""}`
              : voiceState === "recording"
              ? "I'm listening"
              : voiceState === "transcribing"
              ? "Processing"
              : voiceState === "thinking"
              ? "Let me think"
              : ""}
          </h1>
        </div>

        {/* Voice Orb */}
        <div style={{ animation: "fadeIn 0.8s ease-out 0.15s both" }}>
          <VoiceOrb state={voiceState} onClick={handleOrbClick} />
        </div>

        {/* Status Text */}
        <div className="text-center mt-8" style={{ minHeight: 60 }}>
          <p className="text-sm font-light tracking-wide mb-1"
            style={{
              color: voiceState === "recording" ? "rgba(239,68,68,0.7)"
                : voiceState === "speaking" ? "rgba(255,255,255,0.6)"
                : "rgba(255,255,255,0.35)",
              animation: "fadeIn 0.5s ease-out both",
            }}>
            {statusText}
          </p>

          {/* Show transcript briefly */}
          {lastTranscript && voiceState !== "idle" && (
            <p className="text-xs font-light italic max-w-xs mx-auto mt-2"
              style={{ color: "rgba(255,255,255,0.2)", animation: "fadeIn 0.3s ease-out both" }}>
              &ldquo;{lastTranscript}&rdquo;
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <p className="text-xs font-light" style={{ color: "rgba(239,68,68,0.7)" }}>
                {error}
              </p>
              <button onClick={() => setError(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(239,68,68,0.5)" }}>
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Keyboard hint */}
        <div className="absolute bottom-8 left-0 right-0 text-center">
          <p className="text-[10px] font-light tracking-wider"
            style={{ color: "rgba(255,255,255,0.12)" }}>
            <span className="hidden md:inline">Press SPACE to talk · ESC to cancel</span>
            <span className="md:hidden">Tap the orb to speak</span>
          </p>
        </div>
      </div>

      {/* ─── Animations ─── */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes dotPulse {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  )
}