"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Settings, LogOut, X } from "lucide-react"
import { useUser, useClerk } from "@clerk/nextjs"
import * as THREE from "three"

type VoiceState = "idle" | "recording" | "transcribing" | "thinking" | "speaking"
type PersonalityKey = "bestfriend" | "professional" | "playful" | "mentor"

interface ConversationEntry {
  role: "user" | "assistant"
  content: string
}

const PERSONALITY_OPTIONS: { key: PersonalityKey; label: string; emoji: string; desc: string }[] = [
  { key: "bestfriend", label: "Best Friend", emoji: "💛", desc: "Warm, supportive, friendly" },
  { key: "professional", label: "Professional", emoji: "💼", desc: "Sharp, efficient, direct" },
  { key: "playful", label: "Playful", emoji: "✨", desc: "Fun, witty, high energy" },
  { key: "mentor", label: "Mentor", emoji: "🧠", desc: "Wise, thoughtful, guiding" },
]

/* ═══════════════════════════════════════════════════════
   THREE.JS PARTICLE VISUALIZER (NPM Version)
   ═══════════════════════════════════════════════════════ */
function ParticleVisualizer({ state, audioLevel }: { state: VoiceState; audioLevel: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vizRef = useRef<{
    scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; particles: THREE.Points;
    uniforms: any; clock: number; activityLevel: number;
    targetActivity: number; smoothAudio: number
  } | null>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const init = () => {
      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x000000)

      const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 5000)
      camera.position.z = 3

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false })
      renderer.setSize(window.innerWidth, window.innerHeight)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

      const uniforms = {
        uTime: { value: 0 },
        uAudioLow: { value: 0.2 },
        uAudioMid: { value: 0.2 },
        uAudioHigh: { value: 0.2 },
        uActivityLevel: { value: 0.2 },
      }

      const geometry = new THREE.BufferGeometry()
      const positions: number[] = []
      const normals: number[] = []
      const count = 5500

      for (let i = 0; i < count; i++) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = Math.cbrt(Math.random()) * 2
        const x = r * Math.sin(phi) * Math.cos(theta)
        const y = r * Math.sin(phi) * Math.sin(theta)
        const z = r * Math.cos(phi)
        positions.push(x, y, z)
        normals.push(x, y, z)
      }

      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))

      const vertexShader = `
        uniform float uTime;
        uniform float uAudioLow;
        uniform float uAudioMid;
        uniform float uAudioHigh;
        uniform float uActivityLevel;
        varying vec3 vColor;
        varying float vAudioMid;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
        vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

        float snoise(vec3 v) {
          const vec2 C = vec2(1.0/6.0, 1.0/3.0);
          const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
          vec3 i = floor(v + dot(v, C.yyy));
          vec3 x0 = v - i + dot(i, C.xxx);
          vec3 g = step(x0.yzx, x0.xyz);
          vec3 l = 1.0 - g;
          vec3 i1 = min(g.xyz, l.zxy);
          vec3 i2 = max(g.xyz, l.zxy);
          vec3 x1 = x0 - i1 + C.xxx;
          vec3 x2 = x0 - i2 + C.yyy;
          vec3 x3 = x0 - D.yyy;
          i = mod289(i);
          vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
          float n_ = 0.142857142857;
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x2_ = x_ * ns.x + ns.yyyy;
          vec4 y2_ = y_ * ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x2_) - abs(y2_);
          vec4 b0 = vec4(x2_.xy, y2_.xy);
          vec4 b1 = vec4(x2_.zw, y2_.zw);
          vec4 s0 = floor(b0) * 2.0 + 1.0;
          vec4 s1 = floor(b1) * 2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
          vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
          vec3 p0 = vec3(a0.xy, h.x);
          vec3 p1 = vec3(a0.zw, h.y);
          vec3 p2 = vec3(a1.xy, h.z);
          vec3 p3 = vec3(a1.zw, h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
          p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
        }

        vec3 snoiseVec3(vec3 x) {
          return vec3(snoise(x), snoise(vec3(x.y-19.1,x.z+33.4,x.x+47.2)), snoise(vec3(x.z+74.2,x.x-124.5,x.y+99.4)));
        }

        vec3 curlNoise(vec3 p) {
          const float e = .1;
          vec3 dx = vec3(e,0,0); vec3 dy = vec3(0,e,0); vec3 dz = vec3(0,0,e);
          vec3 px0 = snoiseVec3(p-dx); vec3 px1 = snoiseVec3(p+dx);
          vec3 py0 = snoiseVec3(p-dy); vec3 py1 = snoiseVec3(p+dy);
          vec3 pz0 = snoiseVec3(p-dz); vec3 pz1 = snoiseVec3(p+dz);
          float cx = py1.z-py0.z-pz1.y+pz0.y;
          float cy = pz1.x-pz0.x-px1.z+px0.z;
          float cz = px1.y-px0.y-py1.x+py0.x;
          return normalize(vec3(cx,cy,cz));
        }

        void main() {
          float timeScale = (0.08 + uActivityLevel * 0.4);
          float movementScale = (0.15 + uActivityLevel * 0.4);
          vec3 curl = curlNoise(position * 0.5 + uTime * timeScale);
          float noise = snoise(position * 0.5 + uTime * timeScale * 2.0);
          float chaos = (uAudioLow + uAudioMid + uAudioHigh) * 0.3 * uActivityLevel;
          vec3 randomOffset = vec3(
            snoise(position + vec3(uTime * timeScale * 2.0, 0.0, 0.0)),
            snoise(position + vec3(0.0, uTime * timeScale * 2.0, 0.0)),
            snoise(position + vec3(0.0, 0.0, uTime * timeScale * 2.0))
          );
          float expansion = 1.0 + uAudioLow * 0.15 * uActivityLevel;
          vec3 basePosition = position * expansion;
          vec3 orderedMovement = curl * (0.2 + uAudioMid * 0.1) * movementScale + normal * (noise * 0.2 * movementScale);
          vec3 chaoticMovement = randomOffset * chaos * 0.8 * movementScale;
          vec3 displaced = basePosition + mix(orderedMovement, chaoticMovement, chaos * 0.4);
          displaced += curl * sin(uTime * 8.0 * timeScale) * uAudioHigh * 0.08 * uActivityLevel;

          vec3 baseColor = vec3(
            0.5 + 0.5 * sin(curl.y + 2.0 + uActivityLevel * 2.0),
            0.5 + 0.5 * sin(uTime * timeScale + curl.y + uActivityLevel),
            0.5 + 0.5 * sin(uTime * timeScale * 0.1 + curl.z + 4.0)
          );
          vec3 lowColor = vec3(0.1, 0.4, 1.0);
          vec3 midColor = vec3(1.0, 0.4, 0.1);
          vec3 highColor = vec3(1.0, 0.1, 0.4);
          vec3 activeColor = vec3(0.0, 1.0, 0.5);
          vColor = baseColor;
          vColor = mix(vColor, lowColor, uAudioLow * 0.057);
          vColor = mix(vColor, midColor, uAudioMid * 0.057);
          vColor = mix(vColor, highColor, uAudioHigh * 0.057);
          vColor = mix(vColor, activeColor, uActivityLevel * 0.3);
          vAudioMid = uAudioMid;

          vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          float size = (3.0 + uActivityLevel * 2.0);
          size += uAudioLow * 1.0;
          size += uAudioMid * 5.0;
          size *= (1.0 + uAudioHigh);
          gl_PointSize = size * (1.0 / -mvPosition.z);
        }
      `

      const fragmentShader = `
        varying vec3 vColor;
        varying float vAudioMid;
        void main() {
          vec2 center = gl_PointCoord - vec2(0.5);
          float dist = length(center);
          float softness = 0.45 + vAudioMid * 0.1;
          float edge = 0.5;
          if (dist > edge) discard;
          float alpha = 1.0 - smoothstep(softness, edge, dist);
          float innerGlow = 1.0 - smoothstep(0.0, 0.35, dist);
          vec3 finalColor = mix(vColor, vColor * 0.5, innerGlow * vAudioMid);
          gl_FragColor = vec4(finalColor, alpha);
        }
      `

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
      })

      const particles = new THREE.Points(geometry, material)
      scene.add(particles)

      const gridGeo = new THREE.PlaneGeometry(20, 20, 20, 20)
      const gridMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true, transparent: true, opacity: 0.03 })
      const grid = new THREE.Mesh(gridGeo, gridMat)
      grid.position.z = -5
      scene.add(grid)

      vizRef.current = {
        scene, camera, renderer, particles, uniforms,
        clock: 0, activityLevel: 0.2, targetActivity: 0.2, smoothAudio: 0,
      }

      const onMove = (e: MouseEvent) => {
        const mx = (e.clientX / window.innerWidth) * 2 - 1
        camera.position.x = Math.sin(mx * 0.3) * 3
        camera.position.z = Math.cos(mx * 0.3) * 3 + 1
        camera.lookAt(0, 0, 0)
      }
      document.addEventListener("mousemove", onMove)

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight
        camera.updateProjectionMatrix()
        renderer.setSize(window.innerWidth, window.innerHeight)
      }
      window.addEventListener("resize", onResize)

      const animate = () => {
        const v = vizRef.current
        if (!v) return
        v.clock += 0.016
        v.uniforms.uTime.value = v.clock

        v.activityLevel += (v.targetActivity - v.activityLevel) * 0.05
        v.uniforms.uActivityLevel.value = v.activityLevel

        v.smoothAudio += (audioLevel - v.smoothAudio) * 0.15
        const al = v.smoothAudio

        v.uniforms.uAudioLow.value = 0.1 + al * 0.25
        v.uniforms.uAudioMid.value = 0.1 + al * 0.3
        v.uniforms.uAudioHigh.value = 0.1 + al * 0.2

        v.renderer.render(v.scene, v.camera)
        animRef.current = requestAnimationFrame(animate)
      }

      animRef.current = requestAnimationFrame(animate)
    }

    init()

    return () => {
      cancelAnimationFrame(animRef.current)
      if (vizRef.current?.renderer) {
        vizRef.current.renderer.dispose()
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!vizRef.current) return
    switch (state) {
      case "speaking": vizRef.current.targetActivity = 1.0; break
      case "recording": vizRef.current.targetActivity = 0.8; break
      case "thinking": case "transcribing": vizRef.current.targetActivity = 0.6; break
      default: vizRef.current.targetActivity = 0.2; break
    }
  }, [state])

  useEffect(() => {
    if (!vizRef.current) return
    vizRef.current.smoothAudio = audioLevel
  }, [audioLevel])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN VOICE ASSISTANT PAGE
   ═══════════════════════════════════════════════════════ */
export default function VoiceAssistantPage() {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle")
  const [statusText, setStatusText] = useState("Tap anywhere to speak")
  const [lastTranscript, setLastTranscript] = useState("")
  const [audioLevel, setAudioLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [personality, setPersonality] = useState<PersonalityKey>("bestfriend")
  const { user, isLoaded } = useUser()
  const { signOut } = useClerk()

  useEffect(() => {
    try {
      const saved = localStorage.getItem("missi-personality") as PersonalityKey | null
      if (saved && PERSONALITY_OPTIONS.some(p => p.key === saved)) {
        setPersonality(saved)
        personalityRef.current = saved
      }
    } catch {}
  }, [])

  const updatePersonality = useCallback((key: PersonalityKey) => {
    setPersonality(key)
    personalityRef.current = key
    try { localStorage.setItem("missi-personality", key) } catch {}
    conversationRef.current = []
  }, [])

  const conversationRef = useRef<ConversationEntry[]>([])
  const personalityRef = useRef<PersonalityKey>("bestfriend")
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const levelAnimRef = useRef<number | null>(null)
  const hasSpokenRef = useRef(false)

  const ttsContextRef = useRef<AudioContext | null>(null)
  const ttsAnalyserRef = useRef<AnalyserNode | null>(null)
  const continuousRef = useRef(false)

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
    const MAX_RECORD_MS = 30000

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

  const startRecording = useCallback(async () => {
    try {
      if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current = null }
      stopTTSMonitor()

      setVoiceState("recording")
      setStatusText("Listening...")
      setError(null)
      setLastTranscript("")
      audioChunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      streamRef.current = stream
      startAudioMonitor(stream)

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm"
      const recorder = new MediaRecorder(stream, { mimeType: mime })
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        stopAudioMonitor()

        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
        if (blob.size < 500) {
          if (continuousRef.current) {
            startRecording()
          } else {
            setVoiceState("idle")
            setStatusText("Didn't catch that — try again")
            setTimeout(() => setStatusText("Tap anywhere to speak"), 2000)
          }
          return
        }
        await transcribeAudio(blob)
      }

      recorder.start(100)
    } catch {
      setError("Microphone access denied.")
      setVoiceState("idle")
      setStatusText("Tap anywhere to speak")
    }
  }, [startAudioMonitor, stopAudioMonitor, stopTTSMonitor])

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setVoiceState("transcribing")
    setStatusText("Processing...")
    try {
      const fd = new FormData()
      fd.append("audio", blob, "recording.webm")
      const res = await fetch("/api/stt", { method: "POST", body: fd })
      if (!res.ok) throw new Error("STT failed")
      const data = await res.json()
      const text = data.text?.trim()
      if (!text) {
        if (continuousRef.current) {
          startRecording()
        } else {
          setVoiceState("idle")
          setStatusText("Didn't catch that — try again")
          setTimeout(() => setStatusText("Tap anywhere to speak"), 2500)
        }
        return
      }
      setLastTranscript(text)
      conversationRef.current.push({ role: "user", content: text })
      await getAIResponse()
    } catch {
      if (continuousRef.current) {
        setError("Transcription hiccup — listening again...")
        startRecording()
      } else {
        setError("Transcription failed. Try again.")
        setVoiceState("idle")
        setStatusText("Tap anywhere to speak")
      }
    }
  }, [startRecording])

  const getAIResponse = useCallback(async () => {
    setVoiceState("thinking")
    setStatusText("Thinking...")
    const ctrl = new AbortController()
    abortRef.current = ctrl
    try {
      const msgs = conversationRef.current.map((m) => ({ role: m.role, content: m.content }))
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: msgs, personality: personalityRef.current }),
        signal: ctrl.signal,
      })
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
          try { const p = JSON.parse(d); if (p.text) full += p.text } catch {}
        }
      }
      if (!full.trim()) {
        if (continuousRef.current) { startRecording(); return }
        setVoiceState("idle"); setStatusText("Tap anywhere to speak"); return
      }
      conversationRef.current.push({ role: "assistant", content: full })
      if (conversationRef.current.length > 20) conversationRef.current = conversationRef.current.slice(-20)
      await speakText(full)
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") { setVoiceState("idle"); setStatusText("Tap anywhere to speak"); return }
      setError("Failed to get response.")
      if (continuousRef.current) {
        setTimeout(() => { if (continuousRef.current) startRecording() }, 1500)
      } else {
        setVoiceState("idle"); setStatusText("Tap anywhere to speak")
      }
    }
  }, [startRecording])

  const speakText = useCallback(async (text: string) => {
    setVoiceState("speaking")
    setStatusText("")
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error("TTS failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (audioPlayerRef.current) audioPlayerRef.current.pause()
      const audio = new Audio(url)
      audioPlayerRef.current = audio
      startTTSMonitor(audio)

      audio.onended = () => {
        stopTTSMonitor()
        URL.revokeObjectURL(url)
        audioPlayerRef.current = null
        if (continuousRef.current) {
          startRecording()
        } else {
          setVoiceState("idle")
          setStatusText("Tap anywhere to speak")
        }
      }
      audio.onerror = () => {
        stopTTSMonitor()
        URL.revokeObjectURL(url)
        audioPlayerRef.current = null
        if (continuousRef.current) {
          startRecording()
        } else {
          setVoiceState("idle")
          setStatusText("Tap anywhere to speak")
        }
      }

      await audio.play()
    } catch {
      stopTTSMonitor()
      if (continuousRef.current) {
        startRecording()
      } else {
        setVoiceState("idle"); setStatusText("Tap anywhere to speak")
      }
    }
  }, [startTTSMonitor, stopTTSMonitor, startRecording])

  const stopAll = useCallback(() => {
    continuousRef.current = false
    if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop()
    if (audioPlayerRef.current) { audioPlayerRef.current.pause(); audioPlayerRef.current = null }
    abortRef.current?.abort()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    stopAudioMonitor(); stopTTSMonitor()
    setVoiceState("idle"); setStatusText("Tap anywhere to speak")
  }, [stopAudioMonitor, stopTTSMonitor])

  const handleTap = useCallback(() => {
    if (voiceState === "idle") {
      continuousRef.current = true
      startRecording()
    } else if (voiceState === "speaking" || voiceState === "thinking") {
      abortRef.current?.abort()
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause()
        audioPlayerRef.current = null
      }
      stopTTSMonitor()
      continuousRef.current = true
      startRecording()
    } else {
      stopAll()
    }
  }, [voiceState, startRecording, stopAll, stopTTSMonitor])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" && e.target === document.body) { e.preventDefault(); handleTap() }
      if (e.code === "Escape") stopAll()
    }
    window.addEventListener("keydown", h)
    return () => window.removeEventListener("keydown", h)
  }, [handleTap, stopAll])

  useEffect(() => { return () => { stopAll() } }, [stopAll])

  const greetedRef = useRef(false)
  useEffect(() => {
    if (!isLoaded || greetedRef.current) return
    greetedRef.current = true

    const doGreet = async () => {
      await new Promise((r) => setTimeout(r, 1200))

      const name = user?.firstName || ""
      const greetings = [
        `Hey${name ? ` ${name}` : ""}! What's up, how's it going?`,
        `Hey${name ? ` ${name}` : ""}! Good to see you, what can I help with?`,
        `Hey${name ? ` ${name}` : ""}! How are you doing today?`,
      ]
      const text = greetings[Math.floor(Math.random() * greetings.length)]

      try {
        setVoiceState("speaking")
        setStatusText("")

        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })

        if (!res.ok) { setVoiceState("idle"); setStatusText("Tap anywhere to speak"); return }

        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioPlayerRef.current = audio

        startTTSMonitor(audio)

        audio.onended = () => {
          stopTTSMonitor(); URL.revokeObjectURL(url); audioPlayerRef.current = null
          continuousRef.current = true
          startRecording()
        }
        audio.onerror = () => {
          setVoiceState("idle"); setStatusText("Tap anywhere to speak")
          stopTTSMonitor(); URL.revokeObjectURL(url); audioPlayerRef.current = null
        }

        await audio.play()
        conversationRef.current.push({ role: "assistant", content: text })
      } catch {
        setVoiceState("idle"); setStatusText("Tap anywhere to speak")
      }
    }

    doGreet()
  }, [isLoaded, user, startTTSMonitor, stopTTSMonitor])

  const handleLogout = useCallback(() => {
  stopAll()
  setShowSettings(false)
  // Don't await — signOut hangs on Cloudflare Pages
  // Fire it and force redirect after short delay
  signOut().catch(() => {})
  setTimeout(() => {
    window.location.href = "/"
  }, 500)
}, [signOut, stopAll])

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden select-none"
      style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

      <ParticleVisualizer state={voiceState} audioLevel={audioLevel} />

      <div className="fixed inset-0 z-10" onClick={handleTap}
        style={{ cursor: voiceState === "idle" || voiceState === "speaking" ? "pointer" : "default" }} />

      <nav className="relative z-20 flex items-center justify-between px-5 md:px-8 py-4 pointer-events-auto">
        <Link href="/" className="flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-[11px] font-light hidden sm:inline tracking-wide">Home</span>
        </Link>
        <div className="flex items-center gap-2 opacity-40">
          <Image src="/images/logo-symbol.png" alt="missiAI" width={24} height={24}
            className="w-5 h-5 pointer-events-none" priority draggable={false} />
          <span className="text-[11px] font-medium tracking-wider">MISSI</span>
        </div>
        <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings) }}
          className="opacity-40 hover:opacity-70 transition-opacity pointer-events-auto"
          style={{ background: "none", border: "none", cursor: "pointer", color: "white" }}>
          {showSettings ? <X className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
        </button>
      </nav>

      {showSettings && (
        <div className="absolute top-16 right-5 z-30 w-64 rounded-2xl p-4 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(30px)" }}>
          <div className="flex items-center gap-3 mb-4 pb-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            {user?.imageUrl && <img src={user.imageUrl} alt="" className="w-8 h-8 rounded-full opacity-80" />}
            <div>
              <p className="text-xs font-medium text-white/70">{user?.fullName || "User"}</p>
              <p className="text-[10px] font-light text-white/25">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
          </div>

          <div className="mb-4">
            <p className="text-[10px] font-medium tracking-wider uppercase mb-2.5" style={{ color: "rgba(255,255,255,0.3)" }}>
              Missi&apos;s Personality
            </p>
            <div className="flex flex-col gap-1.5">
              {PERSONALITY_OPTIONS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => updatePersonality(p.key)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-all"
                  style={{
                    background: personality === p.key ? "rgba(255,255,255,0.08)" : "transparent",
                    border: personality === p.key ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  <span className="text-sm">{p.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium" style={{ color: personality === p.key ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.45)" }}>
                      {p.label}
                    </p>
                    <p className="text-[9px] font-light" style={{ color: personality === p.key ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.18)" }}>
                      {p.desc}
                    </p>
                  </div>
                  {personality === p.key && (
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "rgba(0,255,140,0.6)" }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
            <button onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-light transition-colors hover:bg-white/5"
              style={{ color: "rgba(255,255,255,0.4)", background: "none", border: "none", cursor: "pointer" }}>
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-20 flex flex-col items-center pb-10 md:pb-14 pointer-events-none">
        <p className="text-base md:text-lg font-light tracking-tight mb-1"
          style={{
            color: voiceState === "recording" ? "rgba(255,80,60,0.8)"
              : voiceState === "speaking" ? "rgba(0,255,140,0.7)"
              : voiceState === "thinking" || voiceState === "transcribing" ? "rgba(255,255,255,0.5)"
              : "rgba(255,255,255,0.3)",
            animation: "fadeIn 0.5s ease-out both",
          }}>
          {voiceState === "idle" && `Hey${user?.firstName ? ` ${user.firstName}` : ""}`}
          {voiceState === "recording" && "Listening..."}
          {voiceState === "transcribing" && "Processing..."}
          {voiceState === "thinking" && "Thinking..."}
          {voiceState === "speaking" && ""}
        </p>

        {lastTranscript && voiceState !== "idle" && (
          <p className="text-[11px] font-light italic max-w-[260px] mx-auto truncate"
            style={{ color: "rgba(255,255,255,0.12)" }}>
            &ldquo;{lastTranscript}&rdquo;
          </p>
        )}

        {voiceState === "idle" && (
          <p className="text-[11px] font-light tracking-wide mt-1" style={{ color: "rgba(255,255,255,0.15)" }}>
            {statusText}
          </p>
        )}

        {voiceState === "recording" && (
          <p className="text-[10px] font-light tracking-wider mt-1" style={{ color: "rgba(255,80,60,0.3)" }}>
            Speak naturally · auto-detects when you're done
          </p>
        )}

        {(voiceState === "thinking" || voiceState === "transcribing") && (
          <p className="text-[10px] font-light tracking-wider mt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
            Tap anywhere to end conversation
          </p>
        )}

        {voiceState === "speaking" && (
          <p className="text-[10px] font-light tracking-wider mt-1" style={{ color: "rgba(0,255,140,0.25)" }}>
            Tap to end conversation
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 mt-2 pointer-events-auto">
            <p className="text-xs font-light" style={{ color: "rgba(239,68,68,0.7)" }}>{error}</p>
            <button onClick={() => setError(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(239,68,68,0.5)" }}>
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        <div className="mt-4">
          <p className="text-[9px] font-light tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.06)" }}>
            <span className="hidden md:inline">Space to talk · Esc to cancel</span>
            <span className="md:hidden">Tap anywhere</span>
          </p>
        </div>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}