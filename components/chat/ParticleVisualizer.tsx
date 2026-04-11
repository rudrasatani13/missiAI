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

/* ────────────────────────────────────────────────────────────────────────────
 *  GLSL Shaders — Organic Living Entity (Bright Bioluminescent Cloud)
 *
 *  Reference: bright green core, cyan-blue edges, vivid glowing particles,
 *  free-form amorphous shape with extending tendrils/wisps.
 *  Dense bright center, particles clearly visible, strong additive glow.
 * ──────────────────────────────────────────────────────────────────────────── */

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uBreathPhase;
  uniform float uPulseIntensity;
  uniform float uFlowSpeed;
  uniform float uExpansion;
  uniform float uCompression;
  uniform float uTendrilStrength;
  uniform float uAudioLevel;
  uniform float uActivityLevel;
  uniform float uStateBlend;

  attribute float aSeed;
  attribute float aLife;
  attribute vec3  aVelocity;

  varying vec3  vColor;
  varying float vAlpha;
  varying float vFromCenter;

  // ── 3D Simplex Noise ──
  vec3 mod289v3(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 mod289v4(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
  vec4 permute(vec4 x){ return mod289v4(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314*r; }

  float snoise(vec3 v){
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289v3(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j  = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x2_ = x_ * ns.x + ns.yyyy;
    vec4 y2_ = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x2_) - abs(y2_);
    vec4 b0 = vec4(x2_.xy, y2_.xy);
    vec4 b1 = vec4(x2_.zw, y2_.zw);
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
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

  // FBM — 3 octaves for organic complexity
  float fbm3(vec3 p, float t) {
    float v = 0.0;
    v += 0.5    * snoise(p * 1.0 + vec3(t * 0.25));
    v += 0.25   * snoise(p * 2.1 + vec3(t * 0.35, t * 0.2, 0.0));
    v += 0.125  * snoise(p * 4.3 + vec3(0.0, t * 0.15, t * 0.3));
    return v;
  }

  // Curl noise for fluid-like flow
  vec3 curlNoise(vec3 p, float t) {
    float e = 0.05;
    float n1 = fbm3(p + vec3(0, e, 0), t) - fbm3(p - vec3(0, e, 0), t);
    float n2 = fbm3(p + vec3(0, 0, e), t) - fbm3(p - vec3(0, 0, e), t);
    float n3 = fbm3(p + vec3(e, 0, 0), t) - fbm3(p - vec3(e, 0, 0), t);
    float n4 = fbm3(p + vec3(0, 0, e), t) - fbm3(p - vec3(0, 0, e), t);
    float n5 = fbm3(p + vec3(e, 0, 0), t) - fbm3(p - vec3(e, 0, 0), t);
    float n6 = fbm3(p + vec3(0, e, 0), t) - fbm3(p - vec3(0, e, 0), t);
    return vec3(n1 - n2, n3 - n4, n5 - n6) / (2.0 * e);
  }

  void main() {
    float t = uTime;
    vec3 basePos = position;
    float fromCenter = length(basePos);

    // ── 1. BREATHING — slow rhythmic expansion/contraction ──
    float breathMain = sin(uBreathPhase) * 0.5 + 0.5;
    float breathPersonal = sin(uBreathPhase * (0.7 + aSeed * 0.6) + aSeed * 6.28) * 0.5 + 0.5;
    float breathScale = 1.0 + (breathMain * 0.12 + breathPersonal * 0.06) * uPulseIntensity;

    // ── 2. CURL NOISE FLOW — fluid organic tendrils (compact) ──
    vec3 flow = curlNoise(basePos * 0.8 + vec3(aSeed), t * uFlowSpeed) * 0.12;
    flow *= (1.0 + uActivityLevel * 0.5);

    // ── 3. TENDRILS — noise-driven outward extensions (contained) ──
    float tendrilNoise = fbm3(basePos * 0.5, t * 0.06);
    float tendrilMask = smoothstep(0.15, 0.6, tendrilNoise);
    vec3 tendrilDir = normalize(basePos + 0.001) * tendrilMask * uTendrilStrength;
    tendrilDir *= (0.15 + fromCenter * 0.4);

    // ── 4. STATE-BASED SCALE ──
    float scaleState = 1.0 + uExpansion - uCompression * 0.35;

    // ── 5. AUDIO REACTIVE RIPPLES (small scale) ──
    float audioRipple = sin(fromCenter * 10.0 - t * 6.0 + uAudioLevel * 12.0) * 0.5 + 0.5;
    vec3 audioDir = normalize(basePos + 0.001) * uAudioLevel * 0.15 * (0.5 + audioRipple * 0.5);

    // ── 6. SPEAKING TURBULENCE (contained) ──
    float speakTurb = smoothstep(0.8, 1.0, uStateBlend);
    vec3 turbulence = vec3(
      snoise(basePos * 3.0 + vec3(t * 1.8, 0.0, 0.0)),
      snoise(basePos * 3.0 + vec3(0.0, t * 1.8, 3.0)),
      snoise(basePos * 3.0 + vec3(7.0, 0.0, t * 1.8))
    ) * speakTurb * 0.1 * uActivityLevel;

    // ── 7. INDIVIDUAL DRIFT (subtle) ──
    vec3 drift = aVelocity * sin(t * 0.5 + aSeed * 6.28) * 0.02;

    // ── Combine all ──
    vec3 displaced = basePos * breathScale * scaleState
                   + flow
                   + tendrilDir
                   + audioDir
                   + drift
                   + turbulence;

    // Soft boundary — keep entity COMPACT
    float r = length(displaced);
    float softMax = 0.9 + uExpansion * 0.25;
    if (r > softMax) {
      displaced = displaced * (softMax / r);
    }

    float finalDist = length(displaced);
    vFromCenter = finalDist;

    // ══════════════════════════════════════════════════════════════
    //  COLOR — VIVID BRIGHT GREEN CORE → CYAN → BLUE EDGES
    //  Matching reference image: bright green center, blue tendrils
    // ══════════════════════════════════════════════════════════════

    // Center → Edge gradient: bright green → cyan → blue
    float t_center = smoothstep(0.0, 0.8, fromCenter);  // 0 at center, 1 at edge

    // Core color: bright vibrant green
    vec3 coreColor = vec3(0.1, 1.0, 0.4);
    // Mid color: bright cyan
    vec3 midColor = vec3(0.0, 0.8, 1.0);
    // Edge color: deep blue
    vec3 edgeColor = vec3(0.0, 0.3, 0.9);

    vec3 col;
    if (t_center < 0.5) {
      col = mix(coreColor, midColor, t_center * 2.0);
    } else {
      col = mix(midColor, edgeColor, (t_center - 0.5) * 2.0);
    }

    // Add subtle noise-based color variation per particle
    float colorNoise = snoise(basePos * 1.5 + vec3(t * 0.05)) * 0.15;
    col.g += colorNoise;
    col.b += colorNoise * 0.5;

    // Speaking: shift toward bright cyan-white
    col = mix(col, vec3(0.5, 1.0, 1.0), speakTurb * 0.4);

    // Thinking: shift toward deep blue-purple
    float thinkBlend = smoothstep(0.5, 0.8, uStateBlend) * (1.0 - speakTurb);
    col = mix(col, vec3(0.2, 0.25, 0.8), thinkBlend * 0.35);

    // Audio brightens
    col += vec3(0.05, 0.15, 0.1) * uAudioLevel * 2.0;

    // Tendril tips glow cyan
    col += vec3(0.0, 0.25, 0.2) * tendrilMask * uTendrilStrength;

    // Keep colors natural
    col *= 0.9;

    vColor = col;

    // ══════════════════════════════════════════════════════════════
    //  ALPHA — BRIGHT, clearly visible particles
    // ══════════════════════════════════════════════════════════════
    float coreGlow = exp(-fromCenter * fromCenter * 3.0);
    float edgeFade = 1.0 - smoothstep(softMax * 0.7, softMax, finalDist);
    float sparkle = 0.8 + 0.2 * sin(t * 2.5 + aSeed * 40.0);

    vAlpha = (0.2 + coreGlow * 0.3) * edgeFade * sparkle * (0.65 + uActivityLevel * 0.25);

    // ── Point size — BIGGER for visibility ──
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float size = 2.8 + coreGlow * 4.0 + uActivityLevel * 2.0;
    size += tendrilMask * 1.5;
    size += uAudioLevel * 3.0;
    size += speakTurb * 2.5;
    // Life pulse
    float lifePulse = sin(fract(aLife + t * 0.02) * 6.28) * 0.5 + 0.5;
    size *= (0.85 + lifePulse * 0.3);

    gl_PointSize = size * (2.5 / -mvPos.z);
  }
`

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3  vColor;
  varying float vAlpha;
  varying float vFromCenter;

  void main() {
    vec2  c    = gl_PointCoord - 0.5;
    float dist = length(c);
    if (dist > 0.5) discard;

    // ── Subtle glow — matches dark reference aesthetic ──
    float core  = exp(-dist * dist * 30.0);
    float inner = exp(-dist * dist * 8.0);
    float outer = exp(-dist * dist * 3.0);
    float wisp  = exp(-dist * dist * 1.2);

    vec3 white = vec3(1.0, 1.0, 0.95);
    vec3 bright = vColor * 1.3;

    vec3 col = mix(bright, white, core * 0.25) * (core * 0.9 + inner * 0.15)
             + bright * inner * 0.45
             + vColor * outer * 0.25
             + vColor * wisp * 0.08;

    float alpha = (core * 0.8 + inner * 0.4 + outer * 0.18 + wisp * 0.06) * vAlpha;

    gl_FragColor = vec4(col, alpha);
  }
`

/* ──────────────────────────────────────────────────────────────────────────── */

/** Gaussian random via Box-Muller transform */
function gaussianRandom(): number {
  let u = 0, v = 0
  while (u === 0) u = Math.random()
  while (v === 0) v = Math.random()
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
}

function ParticleVisualizerInner({ state, isActive, audioLevel = 0, avatarTier = 1 }: ParticleVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vizRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    particles: THREE.Points
    uniforms: Record<string, { value: number }>
    clock: number
    breathClock: number
    sActivity: number; sAudio: number; sExpansion: number; sCompression: number
    sTendril: number; sFlowSpeed: number; sPulse: number; sStateBlend: number
    tActivity: number; tExpansion: number; tCompression: number
    tTendril: number; tFlowSpeed: number; tPulse: number; tStateBlend: number
  } | null>(null)
  const animRef = useRef<number>(0)
  const pausedRef = useRef(false)
  const audioLevelRef = useRef(0)

  useEffect(() => { audioLevelRef.current = audioLevel }, [audioLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const quality = getQualityTier()
    const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    const particleCount = quality === "low"
      ? (isMobile ? 3000 : 5000)
      : Math.min(15000, 8000 + avatarTier * 1000)

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: quality === "high",
        alpha: false,
        powerPreference: "default",
      })
    } catch {
      canvas.style.background = "radial-gradient(ellipse at 50% 45%, rgba(0,40,20,1) 0%, rgba(0,0,0,1) 65%)"
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 50)
    // Camera closer so particles are bigger on screen
    camera.position.set(0, 0, 2.8)
    camera.lookAt(0, 0, 0)

    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "low" ? 1 : 2))

    const uniforms: Record<string, { value: number }> = {
      uTime:            { value: 0 },
      uBreathPhase:     { value: 0 },
      uPulseIntensity:  { value: 0.6 },
      uFlowSpeed:       { value: 0.12 },
      uExpansion:       { value: 0 },
      uCompression:     { value: 0 },
      uTendrilStrength: { value: 0.35 },
      uAudioLevel:      { value: 0 },
      uActivityLevel:   { value: 0.3 },
      uStateBlend:      { value: 0 },
    }

    // ══════════════════════════════════════════════════════════════
    //  PARTICLE DISTRIBUTION — Dense core + organic wisps
    //  Like the reference: dense bright center, scattered tendrils
    // ══════════════════════════════════════════════════════════════
    const positions: number[] = []
    const seeds:     number[] = []
    const lives:     number[] = []
    const velocities:number[] = []

    for (let i = 0; i < particleCount; i++) {
      const seed = Math.random()
      let r: number
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      const band  = Math.random()

      if (band < 0.60) {
        // Dense core — gaussian cluster (bright green area in reference)
        r = Math.abs(gaussianRandom()) * 0.18
        r = Math.min(r, 0.35)
      } else if (band < 0.82) {
        // Mid-range cloud
        r = 0.1 + Math.random() * 0.25
      } else if (band < 0.94) {
        // Extended wisps/tendrils (blue area in reference)
        r = 0.2 + Math.random() * 0.3
      } else {
        // Far-out scattered particles (few outliers)
        r = 0.3 + Math.random() * 0.25
      }

      // Slight asymmetry for organic shape
      const asymX = 1.0 + (Math.random() - 0.5) * 0.25
      const asymY = 1.0 + (Math.random() - 0.5) * 0.2
      const asymZ = 1.0 + (Math.random() - 0.5) * 0.15

      positions.push(
        r * Math.sin(phi) * Math.cos(theta) * asymX,
        r * Math.sin(phi) * Math.sin(theta) * asymY,
        r * Math.cos(phi) * asymZ,
      )
      seeds.push(seed)
      lives.push(Math.random())

      const vTheta = Math.random() * Math.PI * 2
      const vPhi   = Math.acos(2 * Math.random() - 1)
      velocities.push(
        Math.sin(vPhi) * Math.cos(vTheta),
        Math.sin(vPhi) * Math.sin(vTheta),
        Math.cos(vPhi),
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position",  new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute("aSeed",     new THREE.Float32BufferAttribute(seeds, 1))
    geometry.setAttribute("aLife",     new THREE.Float32BufferAttribute(lives, 1))
    geometry.setAttribute("aVelocity", new THREE.Float32BufferAttribute(velocities, 3))

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader:   VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })

    const particles = new THREE.Points(geometry, material)
    scene.add(particles)

    vizRef.current = {
      scene, camera, renderer, particles, uniforms,
      clock: 0, breathClock: 0,
      sActivity: 0.3, sAudio: 0, sExpansion: 0, sCompression: 0,
      sTendril: 0.35, sFlowSpeed: 0.12, sPulse: 0.6, sStateBlend: 0,
      tActivity: 0.3, tExpansion: 0, tCompression: 0,
      tTendril: 0.35, tFlowSpeed: 0.12, tPulse: 0.6, tStateBlend: 0,
    }

    // Parallax on mouse move
    const onMove = (e: MouseEvent) => {
      const mx = (e.clientX / window.innerWidth)  * 2 - 1
      const my = (e.clientY / window.innerHeight) * 2 - 1
      camera.position.x = mx * 0.2
      camera.position.y = -my * 0.15
      camera.position.z = 2.8
      camera.lookAt(0, 0, 0)
    }
    document.addEventListener("mousemove", onMove)

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight, false)
    }
    window.addEventListener("resize", onResize)

    const onVisibility = () => {
      pausedRef.current = document.hidden
      if (!document.hidden) animRef.current = requestAnimationFrame(animate)
    }
    document.addEventListener("visibilitychange", onVisibility)

    const animate = () => {
      if (pausedRef.current) return
      const v = vizRef.current
      if (!v) return

      const dt = 0.016
      v.clock += dt
      v.breathClock += dt * (0.4 + v.sActivity * 0.3)

      const lerp = (a: number, b: number, f: number) => a + (b - a) * f
      v.sActivity    = lerp(v.sActivity,    v.tActivity,    0.04)
      v.sAudio       = lerp(v.sAudio,       audioLevelRef.current, 0.12)
      v.sExpansion   = lerp(v.sExpansion,   v.tExpansion,   0.03)
      v.sCompression = lerp(v.sCompression, v.tCompression, 0.05)
      v.sTendril     = lerp(v.sTendril,     v.tTendril,     0.04)
      v.sFlowSpeed   = lerp(v.sFlowSpeed,   v.tFlowSpeed,   0.03)
      v.sPulse       = lerp(v.sPulse,       v.tPulse,       0.04)
      v.sStateBlend  = lerp(v.sStateBlend,  v.tStateBlend,  0.04)

      v.uniforms.uTime.value            = v.clock
      v.uniforms.uBreathPhase.value     = v.breathClock
      v.uniforms.uPulseIntensity.value  = v.sPulse
      v.uniforms.uFlowSpeed.value       = v.sFlowSpeed
      v.uniforms.uExpansion.value       = v.sExpansion
      v.uniforms.uCompression.value     = v.sCompression
      v.uniforms.uTendrilStrength.value = v.sTendril
      v.uniforms.uAudioLevel.value      = v.sAudio
      v.uniforms.uActivityLevel.value   = v.sActivity
      v.uniforms.uStateBlend.value      = v.sStateBlend

      // Gentle slow rotation
      v.particles.rotation.y = Math.sin(v.clock * 0.05) * 0.12
      v.particles.rotation.x = Math.cos(v.clock * 0.04) * 0.06

      v.renderer.render(v.scene, v.camera)
      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      document.removeEventListener("mousemove", onMove)
      window.removeEventListener("resize", onResize)
      document.removeEventListener("visibilitychange", onVisibility)
      try { renderer.dispose() } catch { }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── State-driven behavior ──
  useEffect(() => {
    if (!vizRef.current) return
    const v = vizRef.current

    switch (state) {
      case "speaking":
        v.tActivity = 1.0; v.tExpansion = 0.5; v.tCompression = 0
        v.tTendril = 0.7; v.tFlowSpeed = 0.35; v.tPulse = 1.0; v.tStateBlend = 1.0
        break
      case "recording":
        v.tActivity = 0.7; v.tExpansion = 0.05; v.tCompression = 0.15
        v.tTendril = 0.45; v.tFlowSpeed = 0.2; v.tPulse = 0.75; v.tStateBlend = 0.33
        break
      case "thinking":
      case "transcribing":
        v.tActivity = 0.6; v.tExpansion = 0; v.tCompression = 0.35
        v.tTendril = 0.15; v.tFlowSpeed = 0.25; v.tPulse = 0.5; v.tStateBlend = 0.66
        break
      default:
        v.tActivity = 0.3; v.tExpansion = 0; v.tCompression = 0
        v.tTendril = 0.35; v.tFlowSpeed = 0.12; v.tPulse = 0.6; v.tStateBlend = 0
        break
    }
  }, [state])

  useEffect(() => {
    if (!vizRef.current) return
    vizRef.current.sAudio = audioLevel
  }, [audioLevel])

  return (
    <canvas
      ref={canvasRef}
      data-testid="particle-visualizer"
      style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
    />
  )
}

export const ParticleVisualizer = memo(ParticleVisualizerInner)
