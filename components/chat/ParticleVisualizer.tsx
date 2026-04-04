"use client"

import { memo, useRef, useEffect } from "react"
import * as THREE from "three"
import type { VoiceState } from "@/types/chat"

interface ParticleVisualizerProps {
  state: VoiceState
  isActive: boolean
  audioLevel?: number
}

function getQualityTier(): "low" | "high" {
  // Always use low quality on mobile — WebGL context limits are much tighter
  if (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return "low"
  const cores = navigator.hardwareConcurrency || 2
  const memory = (navigator as any).deviceMemory || 4
  if (cores <= 4 || memory <= 4) return "low"
  return "high"
}

const VERTEX_SHADER = `
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
      0.65 + 0.35 * sin(curl.y + 2.0 + uActivityLevel * 2.0),
      0.65 + 0.35 * sin(uTime * timeScale + curl.y + uActivityLevel),
      0.75 + 0.25 * sin(uTime * timeScale * 0.1 + curl.z + 4.0)
    );
    vec3 lowColor  = vec3(0.3, 0.55, 1.0);
    vec3 midColor  = vec3(0.7, 0.45, 1.0);
    vec3 highColor = vec3(1.0, 0.55, 0.85);
    vec3 activeColor = vec3(0.35, 0.65, 1.0);
    vColor = baseColor;
    vColor = mix(vColor, lowColor,    uAudioLow  * 0.2);
    vColor = mix(vColor, midColor,    uAudioMid  * 0.2);
    vColor = mix(vColor, highColor,   uAudioHigh * 0.2);
    vColor = mix(vColor, activeColor, uActivityLevel * 0.35);
    vAudioMid = uAudioMid;

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float size = (2.5 + uActivityLevel * 2.5);
    size += uAudioLow  * 1.0;
    size += uAudioMid  * 5.0;
    size *= (1.0 + uAudioHigh * 0.5);
    gl_PointSize = size * (1.0 / -mvPosition.z);
  }
`

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAudioMid;
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    float softness = 0.45 + vAudioMid * 0.1;
    float edge = 0.5;
    if (dist > edge) discard;
    float alpha = 1.0 - smoothstep(softness, edge, dist);
    float innerGlow = 1.0 - smoothstep(0.0, 0.25, dist);
    vec3 finalColor = mix(vColor, vColor * 0.5, innerGlow * vAudioMid);
    gl_FragColor = vec4(finalColor * 1.4, alpha);
  }
`

function ParticleVisualizerInner({ state, isActive, audioLevel = 0 }: ParticleVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vizRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    particles: THREE.Points
    uniforms: Record<string, { value: number }>
    clock: number
    activityLevel: number
    targetActivity: number
    smoothAudio: number
  } | null>(null)
  const animRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const audioLevelRef = useRef(0)

  useEffect(() => {
    audioLevelRef.current = audioLevel
  }, [audioLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const quality = getQualityTier()
    // Mobile: 500 particles max; desktop low: 1200; desktop high: 4000
    const particleCount = quality === "low"
      ? (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 500 : 1200)
      : 4000

    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: quality === "high",
        alpha: false,
        powerPreference: "default",
      })
    } catch {
      // WebGL not supported — canvas stays black, page keeps working
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      5000,
    )
    camera.position.z = 3.5

    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "low" ? 1 : 2))

    const uniforms = {
      uTime: { value: 0 },
      uAudioLow: { value: 0.15 },
      uAudioMid: { value: 0.15 },
      uAudioHigh: { value: 0.1 },
      uActivityLevel: { value: 0.2 },
    }

    const geometry = new THREE.BufferGeometry()
    const positions: number[] = []
    const normals: number[] = []

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 0.5 + Math.random() * 1.0
      const x = r * Math.sin(phi) * Math.cos(theta)
      const y = r * Math.sin(phi) * Math.sin(theta)
      const z = r * Math.cos(phi)
      positions.push(x, y, z)
      normals.push(x, y, z)
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    vizRef.current = {
      scene,
      camera,
      renderer,
      particles,
      uniforms,
      clock: 0,
      activityLevel: 0.2,
      targetActivity: 0.2,
      smoothAudio: 0,
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

    const onVisibility = () => {
      pausedRef.current = document.hidden
      if (!document.hidden) {
        animRef.current = requestAnimationFrame(animate)
      }
    }
    document.addEventListener("visibilitychange", onVisibility)

    const animate = () => {
      if (pausedRef.current) return
      const v = vizRef.current
      if (!v) return
      v.clock += 0.016
      v.uniforms.uTime.value = v.clock
      v.activityLevel += (v.targetActivity - v.activityLevel) * 0.05
      v.uniforms.uActivityLevel.value = v.activityLevel
      v.smoothAudio += (audioLevelRef.current - v.smoothAudio) * 0.15
      const al = v.smoothAudio
      v.uniforms.uAudioLow.value = 0.1 + al * 0.25
      v.uniforms.uAudioMid.value = 0.1 + al * 0.3
      v.uniforms.uAudioHigh.value = 0.1 + al * 0.2
      v.renderer.render(v.scene, v.camera)
      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      document.removeEventListener("mousemove", onMove)
      window.removeEventListener("resize", onResize)
      document.removeEventListener("visibilitychange", onVisibility)
      try { renderer.dispose() } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!vizRef.current) return
    switch (state) {
      case "speaking":
        vizRef.current.targetActivity = 1.0
        break
      case "recording":
        vizRef.current.targetActivity = 0.8
        break
      case "thinking":
      case "transcribing":
        vizRef.current.targetActivity = 0.6
        break
      default:
        vizRef.current.targetActivity = 0.2
        break
    }
  }, [state])

  useEffect(() => {
    if (!vizRef.current) return
    vizRef.current.smoothAudio = audioLevel
  }, [audioLevel])

  return (
    <canvas
      ref={canvasRef}
      data-testid="particle-visualizer"
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  )
}

export const ParticleVisualizer = memo(ParticleVisualizerInner)
