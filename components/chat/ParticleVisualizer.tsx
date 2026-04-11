"use client"

import { memo, useRef, useEffect } from "react"
import * as THREE from "three"
import type { VoiceState } from "@/types/chat"
import type { AvatarTier } from "@/types/gamification"

interface ParticleVisualizerProps {
  state: VoiceState
  isActive: boolean
  audioLevel?: number
  avatarTier?: AvatarTier
}

function getQualityTier(): "low" | "high" {
  if (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return "low"
  const cores = navigator.hardwareConcurrency || 2
  const memory = (navigator as any).deviceMemory || 4
  if (cores <= 4 || memory <= 4) return "low"
  return "high"
}

// ─── Fibonacci Sphere — evenly distributed points on a sphere surface ─────
function fibonacciSphere(count: number, radius: number): Float32Array {
  const positions = new Float32Array(count * 3)
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < count; i++) {
    const y = 1 - (2 * i) / (count - 1)
    const r = Math.sqrt(1 - y * y) * radius
    const theta = golden * i
    positions[i * 3] = Math.cos(theta) * r
    positions[i * 3 + 1] = y * radius
    positions[i * 3 + 2] = Math.sin(theta) * r
  }
  return positions
}

// ─── Build neural connections between nearby nodes ────────────────────────
function buildConnections(
  positions: Float32Array, count: number, maxPerNode: number, maxDist: number,
): { linePositions: Float32Array; lineAlphas: Float32Array } {
  const lines: number[] = []
  const alphas: number[] = []
  for (let i = 0; i < count; i++) {
    const x1 = positions[i * 3], y1 = positions[i * 3 + 1], z1 = positions[i * 3 + 2]
    let c = 0
    for (let j = i + 1; j < count && c < maxPerNode; j++) {
      const dx = positions[j * 3] - x1
      const dy = positions[j * 3 + 1] - y1
      const dz = positions[j * 3 + 2] - z1
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < maxDist) {
        lines.push(x1, y1, z1, positions[j * 3], positions[j * 3 + 1], positions[j * 3 + 2])
        const a = 1 - d / maxDist // closer = brighter
        alphas.push(a, a)
        c++
      }
    }
  }
  return { linePositions: new Float32Array(lines), lineAlphas: new Float32Array(alphas) }
}

// ═══════════════════════════════════════════════════════════════════════════
// GLSL Shaders
// ═══════════════════════════════════════════════════════════════════════════

// ── Core sphere: translucent holographic orb with fresnel edge glow ──
const CORE_VS = `
  varying vec3 vNormal;
  varying vec3 vWorldPos;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const CORE_FS = `
  uniform float uTime;
  uniform float uPulse;
  uniform float uActivity;
  varying vec3 vNormal;
  varying vec3 vWorldPos;

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorldPos);
    float fresnel = 1.0 - abs(dot(viewDir, vNormal));
    fresnel = pow(fresnel, 2.5);

    // Internal energy ripple
    float energy = sin(vWorldPos.x * 10.0 + uTime * 2.0)
                 * sin(vWorldPos.y * 10.0 + uTime * 1.7)
                 * sin(vWorldPos.z * 10.0 + uTime * 2.3);
    energy = energy * 0.5 + 0.5;

    vec3 cyan  = vec3(0.0, 0.83, 1.0);
    vec3 deep  = vec3(0.0, 0.35, 0.85);
    vec3 color = mix(cyan * 1.2, deep, fresnel);
    color += energy * 0.12 * uActivity;
    color *= 1.0 + uPulse * 0.25;

    float alpha = fresnel * 0.55 + energy * 0.08 * uActivity + 0.04;
    alpha *= 0.35 + uActivity * 0.65;
    gl_FragColor = vec4(color, alpha);
  }
`

// ── Neural node points ──
const NODE_VS = `
  uniform float uTime;
  uniform float uActivity;
  uniform float uAudioMid;
  attribute float aSeed;
  varying float vAlpha;

  void main() {
    float breathe = sin(uTime * 1.5 + aSeed * 6.28) * 0.02 * uActivity;
    vec3 pos = position * (1.0 + breathe);
    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float pulse = sin(uTime * 3.0 + aSeed * 20.0) * 0.5 + 0.5;
    float size = 2.5 + uActivity * 2.5 + uAudioMid * 5.0 + pulse * uActivity * 2.0;
    gl_PointSize = size * (300.0 / -mvPos.z);

    vAlpha = 0.25 + uActivity * 0.55 + pulse * 0.2 * uActivity;
  }
`
const NODE_FS = `
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float dist = length(c);
    if (dist > 0.5) discard;

    float core = exp(-dist * dist * 45.0);
    float glow = exp(-dist * dist * 8.0);

    vec3 cyan = vec3(0.0, 0.83, 1.0);
    vec3 white = vec3(0.88, 0.97, 1.0);
    vec3 color = mix(cyan, white, core * 0.85);
    float alpha = (core * 1.6 + glow * 0.45) * vAlpha;
    gl_FragColor = vec4(color, alpha);
  }
`

// ── Neural connections (line segments) ──
const LINE_VS = `
  uniform float uTime;
  uniform float uActivity;
  attribute float aLineAlpha;
  varying float vLA;

  void main() {
    vLA = aLineAlpha;
    float breathe = sin(uTime * 1.5) * 0.02 * uActivity;
    vec3 pos = position * (1.0 + breathe);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`
const LINE_FS = `
  uniform float uTime;
  uniform float uActivity;
  uniform float uFlash;
  varying float vLA;

  void main() {
    vec3 color = vec3(0.0, 0.65, 1.0);
    float flash = sin(uTime * 8.0 + vLA * 18.0) * 0.5 + 0.5;
    color += flash * uFlash * vec3(0.15, 0.35, 0.55);
    float alpha = vLA * (0.06 + uActivity * 0.35) + flash * uFlash * 0.25;
    gl_FragColor = vec4(color, alpha);
  }
`

// ── Orbital ring ──
const RING_VS = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const RING_FS = `
  uniform float uTime;
  uniform float uActivity;
  uniform float uAudioLow;
  varying vec2 vUv;

  void main() {
    float scan = sin(vUv.x * 25.13 + uTime * 3.5) * 0.5 + 0.5;
    scan = pow(scan, 4.0);

    vec3 color = vec3(0.0, 0.55, 1.0);
    color += scan * vec3(0.0, 0.35, 0.5) * uActivity;
    color *= 1.0 + uAudioLow * 0.35;

    float edge = 1.0 - abs(vUv.y - 0.5) * 2.0;
    edge = pow(max(edge, 0.0), 0.6);

    float alpha = edge * (0.12 + uActivity * 0.38 + scan * 0.18);
    gl_FragColor = vec4(color, alpha);
  }
`

// ═══════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════

function ParticleVisualizerInner({ state, isActive, audioLevel = 0 }: ParticleVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vizRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    group: THREE.Group
    coreMesh: THREE.Mesh
    rings: THREE.Mesh[]
    uCore: Record<string, { value: number }>
    uNodes: Record<string, { value: number }>
    uLines: Record<string, { value: number }>
    uRings: Record<string, { value: number }>[]
    clock: number
    activity: number
    targetActivity: number
    flash: number
    targetFlash: number
    smoothAudio: number
    dragging: boolean
    prevMX: number
    prevMY: number
    velX: number
    velY: number
  } | null>(null)
  const animRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const audioRef = useRef(0)

  useEffect(() => { audioRef.current = audioLevel }, [audioLevel])

  // ── Setup ──
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const isLow = getQualityTier() === "low"
    const nodeCount = isLow ? 280 : 550
    const maxConn = isLow ? 2 : 3
    const maxDist = isLow ? 0.5 : 0.42

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: !isLow, alpha: false, powerPreference: "default" })
    } catch {
      canvas.style.background = "radial-gradient(ellipse at 50% 45%, #001428 0%, #000 65%)"
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 100)
    camera.position.set(0, 0, 3.6)
    camera.lookAt(0, 0, 0)

    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isLow ? 1 : 2))

    const group = new THREE.Group()
    scene.add(group)

    // ── Uniforms ──
    const uCore  = { uTime: { value: 0 }, uPulse: { value: 0 }, uActivity: { value: 0.2 } }
    const uNodes = { uTime: { value: 0 }, uActivity: { value: 0.2 }, uAudioMid: { value: 0 } }
    const uLines = { uTime: { value: 0 }, uActivity: { value: 0.2 }, uFlash: { value: 0 } }

    // ── 1. Core sphere ──
    const coreGeom = new THREE.SphereGeometry(0.32, 32, 32)
    const coreMat = new THREE.ShaderMaterial({
      uniforms: uCore, vertexShader: CORE_VS, fragmentShader: CORE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
    const coreMesh = new THREE.Mesh(coreGeom, coreMat)
    group.add(coreMesh)

    // ── 2. Neural nodes ──
    const nodePos = fibonacciSphere(nodeCount, 1.0)
    const seeds = new Float32Array(nodeCount)
    for (let i = 0; i < nodeCount; i++) seeds[i] = Math.random()

    const nGeom = new THREE.BufferGeometry()
    nGeom.setAttribute("position", new THREE.BufferAttribute(nodePos, 3))
    nGeom.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1))
    const nMat = new THREE.ShaderMaterial({
      uniforms: uNodes, vertexShader: NODE_VS, fragmentShader: NODE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    group.add(new THREE.Points(nGeom, nMat))

    // ── 3. Neural connections ──
    const { linePositions, lineAlphas } = buildConnections(nodePos, nodeCount, maxConn, maxDist)
    const lGeom = new THREE.BufferGeometry()
    lGeom.setAttribute("position", new THREE.BufferAttribute(linePositions, 3))
    lGeom.setAttribute("aLineAlpha", new THREE.BufferAttribute(lineAlphas, 1))
    const lMat = new THREE.ShaderMaterial({
      uniforms: uLines, vertexShader: LINE_VS, fragmentShader: LINE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    group.add(new THREE.LineSegments(lGeom, lMat))

    // ── 4. Orbital rings ──
    const ringDefs = [
      { r: 1.35, tube: 0.01, ax: new THREE.Euler(Math.PI / 2.5, 0.3, 0),  spd: 0.35 },
      { r: 1.50, tube: 0.007, ax: new THREE.Euler(0.4, Math.PI / 3, 0.6), spd: -0.28 },
      { r: 1.65, tube: 0.005, ax: new THREE.Euler(1.2, 0.8, Math.PI / 4), spd: 0.22 },
    ]
    const rings: THREE.Mesh[] = []
    const uRings: Record<string, { value: number }>[] = []

    for (const d of ringDefs) {
      const ru = { uTime: { value: 0 }, uActivity: { value: 0.2 }, uAudioLow: { value: 0 } }
      uRings.push(ru)
      const rGeom = new THREE.TorusGeometry(d.r, d.tube, 6, 160)
      const rMat = new THREE.ShaderMaterial({
        uniforms: ru, vertexShader: RING_VS, fragmentShader: RING_FS,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(rGeom, rMat)
      mesh.rotation.copy(d.ax)
      mesh.userData.spd = d.spd
      rings.push(mesh)
      group.add(mesh)
    }

    // ── Store ──
    vizRef.current = {
      scene, camera, renderer, group, coreMesh, rings,
      uCore, uNodes, uLines, uRings,
      clock: 0, activity: 0.2, targetActivity: 0.2,
      flash: 0, targetFlash: 0, smoothAudio: 0,
      dragging: false, prevMX: 0, prevMY: 0, velX: 0, velY: 0.003,
    }

    // ── Mouse / Touch drag ──
    const startDrag = (x: number, y: number) => {
      if (!vizRef.current) return
      vizRef.current.dragging = true
      vizRef.current.prevMX = x
      vizRef.current.prevMY = y
    }
    const moveDrag = (x: number, y: number) => {
      const v = vizRef.current
      if (!v || !v.dragging) return
      v.velY = (x - v.prevMX) * 0.004
      v.velX = (y - v.prevMY) * 0.004
      v.prevMX = x
      v.prevMY = y
    }
    const endDrag = () => { if (vizRef.current) vizRef.current.dragging = false }

    const onMD = (e: MouseEvent) => startDrag(e.clientX, e.clientY)
    const onMM = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const onMU = () => endDrag()
    const onTS = (e: TouchEvent) => { if (e.touches[0]) startDrag(e.touches[0].clientX, e.touches[0].clientY) }
    const onTM = (e: TouchEvent) => { if (e.touches[0]) moveDrag(e.touches[0].clientX, e.touches[0].clientY) }
    const onTE = () => endDrag()

    canvas.addEventListener("mousedown", onMD)
    document.addEventListener("mousemove", onMM)
    document.addEventListener("mouseup", onMU)
    canvas.addEventListener("touchstart", onTS, { passive: true })
    document.addEventListener("touchmove", onTM, { passive: true })
    document.addEventListener("touchend", onTE)

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight, false)
    }
    window.addEventListener("resize", onResize)

    const onVis = () => {
      pausedRef.current = document.hidden
      if (!document.hidden) animRef.current = requestAnimationFrame(tick)
    }
    document.addEventListener("visibilitychange", onVis)

    // ── Animation loop ──
    const tick = () => {
      if (pausedRef.current) return
      const v = vizRef.current
      if (!v) return

      v.clock += 0.016
      const t = v.clock

      // Smooth transitions
      v.activity += (v.targetActivity - v.activity) * 0.05
      v.flash += (v.targetFlash - v.flash) * 0.08
      v.smoothAudio += (audioRef.current - v.smoothAudio) * 0.15
      const a = v.activity
      const al = v.smoothAudio

      // Update uniforms
      v.uCore.uTime.value = t
      v.uCore.uPulse.value = al
      v.uCore.uActivity.value = a
      v.coreMesh.scale.setScalar(1.0 + al * 0.18 * a)

      v.uNodes.uTime.value = t
      v.uNodes.uActivity.value = a
      v.uNodes.uAudioMid.value = al * 0.5

      v.uLines.uTime.value = t
      v.uLines.uActivity.value = a
      v.uLines.uFlash.value = v.flash

      v.uRings.forEach((ru) => { ru.uTime.value = t; ru.uActivity.value = a; ru.uAudioLow.value = al * 0.4 })

      // Spin rings
      for (const ring of v.rings) {
        const spd = (ring.userData.spd || 0.3) * (0.4 + a * 1.8)
        ring.rotation.z += spd * 0.016
      }

      // Mouse rotation with inertia
      v.group.rotation.y += v.velY
      v.group.rotation.x += v.velX
      // Clamp X so it doesn't flip over
      v.group.rotation.x = Math.max(-1.2, Math.min(1.2, v.group.rotation.x))

      if (!v.dragging) {
        v.velX *= 0.94
        v.velY = v.velY * 0.94 + 0.0008 // drift to slow auto-rotate
      }

      v.renderer.render(v.scene, v.camera)
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animRef.current)
      canvas.removeEventListener("mousedown", onMD)
      document.removeEventListener("mousemove", onMM)
      document.removeEventListener("mouseup", onMU)
      canvas.removeEventListener("touchstart", onTS)
      document.removeEventListener("touchmove", onTM)
      document.removeEventListener("touchend", onTE)
      window.removeEventListener("resize", onResize)
      document.removeEventListener("visibilitychange", onVis)
      try { renderer.dispose() } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── State-driven behaviour ──
  useEffect(() => {
    if (!vizRef.current) return
    switch (state) {
      case "speaking":
        vizRef.current.targetActivity = 1.0
        vizRef.current.targetFlash = 0.0
        break
      case "recording":
        vizRef.current.targetActivity = 0.7
        vizRef.current.targetFlash = 0.0
        break
      case "thinking":
      case "transcribing":
        vizRef.current.targetActivity = 0.85
        vizRef.current.targetFlash = 1.0 // neural flash
        break
      default:
        vizRef.current.targetActivity = 0.2
        vizRef.current.targetFlash = 0.0
        break
    }
  }, [state])

  useEffect(() => {
    if (vizRef.current) vizRef.current.smoothAudio = audioLevel
  }, [audioLevel])

  return (
    <canvas
      ref={canvasRef}
      data-testid="particle-visualizer"
      style={{
        position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
        zIndex: 0, cursor: "grab", touchAction: "none",
      }}
    />
  )
}

export const ParticleVisualizer = memo(ParticleVisualizerInner)
