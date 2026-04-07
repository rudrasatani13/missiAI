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

  attribute float aSeed;

  varying vec3 vColor;
  varying float vAlpha;

  // ── simplex noise ──
  vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}
  vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}
  vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}
  vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
  float snoise(vec3 v){
    const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
    vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
    vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
    vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
    vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
    i=mod289v3(i);
    vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
    float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;
    vec4 j=p-49.*floor(p*ns.z*ns.z);
    vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
    vec4 x2_=x_*ns.x+ns.yyyy;vec4 y2_=y_*ns.x+ns.yyyy;
    vec4 h=1.-abs(x2_)-abs(y2_);
    vec4 b0=vec4(x2_.xy,y2_.xy);vec4 b1=vec4(x2_.zw,y2_.zw);
    vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;
    vec4 sh=-step(h,vec4(0.));
    vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
    vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
    vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
    p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
    vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
    return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
  }

  void main() {
    float t = uTime * (0.06 + uActivityLevel * 0.18);

    // ── Slow internal circulation: rotate around Z axis (moon face-on) ──
    // Each particle orbits based on its XY position (circular flow within sphere)
    float rXY      = length(position.xy);
    float angle    = atan(position.y, position.x);
    // Differential rotation: center faster, edge slower
    float rotSpeed = (0.18 + uActivityLevel * 0.4) / (rXY * 0.5 + 0.5);
    float newAngle = angle + uTime * rotSpeed * (0.06 + uActivityLevel * 0.15);
    vec3  rotated  = vec3(rXY * cos(newAngle), rXY * sin(newAngle), position.z);

    // ── Organic drift (subtle noise) ──
    float nScale = 0.5;
    float noiseT = uTime * 0.04;
    vec3 drift = vec3(
      snoise(position * nScale + vec3(noiseT, 0., 0.)),
      snoise(position * nScale + vec3(0., noiseT, 2.4)),
      snoise(position * nScale + vec3(5.1, 0., noiseT))
    ) * (0.04 + uAudioLow * 0.06 * uActivityLevel);

    // ── Audio pulse ──
    float pulse = 1.0 + uAudioLow * 0.15 * uActivityLevel;

    vec3 displaced = rotated * pulse + drift;

    // ── Soft boundary: keep inside sphere ──
    float maxR = 1.0;
    float r3d  = length(displaced);
    if (r3d > maxR) displaced = displaced * (maxR / r3d);

    // ── Smooth color cycling over time ──
    float fromCenter = length(position.xy) / 1.0;

    // Global hue shifts slowly with time; each particle has tiny phase offset via aSeed
    float speed  = 0.18;
    float phase  = uTime * speed + aSeed * 1.2; // slight per-particle variation

    // Smooth RGB cycling: 3 sine waves 120° apart = full color spectrum loop
    vec3 col;
    col.r = 0.5 + 0.5 * sin(phase);
    col.g = 0.5 + 0.5 * sin(phase + 2.094);  // +120°
    col.b = 0.5 + 0.5 * sin(phase + 4.189);  // +240°

    // Boost saturation — push away from grey center
    col = normalize(col) * 0.9 + col * 0.4;
    col = clamp(col, 0.0, 1.0);

    // Audio brightens
    col *= 1.0 + uAudioMid * 0.5 * uActivityLevel + uAudioHigh * 0.3 * uActivityLevel;
    vColor = col;

    // ── Alpha / brightness: core brighter, edge dimmer (limb darkening) ──
    float coreFactor = exp(-fromCenter * fromCenter * 1.8);
    float sparkle    = 0.6 + 0.4 * aSeed;
    vAlpha = (0.5 + coreFactor * 0.8) * sparkle * (0.7 + uActivityLevel * 0.4);

    // ── Point size ──
    vec4 mvPos = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPos;

    float size = 2.8 + coreFactor * 3.5 + uActivityLevel * 3.0;
    size += uAudioMid  * 6.0;
    size += uAudioHigh * 2.0;
    gl_PointSize = size * (1.0 / -mvPos.z);
  }
`

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec2  c    = gl_PointCoord - 0.5;
    float dist = length(c);
    if (dist > 0.5) discard;

    // Gaussian glow layers — additive blending creates bloom where particles overlap
    float core  = exp(-dist * dist * 30.0);
    float inner = exp(-dist * dist * 9.0);
    float outer = exp(-dist * dist * 3.0);

    vec3 white = vec3(1.0);
    vec3 col   = mix(vColor * 1.6, white, core * 0.8);
    col        = col * core * 2.5 + vColor * inner + vColor * outer * 0.3;

    float alpha = (core * 1.8 + inner * 0.65 + outer * 0.2) * vAlpha;

    gl_FragColor = vec4(col, alpha);
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

  useEffect(() => { audioLevelRef.current = audioLevel }, [audioLevel])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const quality = getQualityTier()
    const particleCount = quality === "low"
      ? (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1500 : 2500)
      : 5000

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: quality === "high",
        alpha: false,
        powerPreference: "default",
      })
    } catch {
      canvas.style.background = "radial-gradient(ellipse at 50% 45%, rgba(10,10,40,1) 0%, rgba(0,0,0,1) 65%)"
      return
    }

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x000000)

    // Camera faces the moon directly from the front
    const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 5000)
    camera.position.set(0, 0, 3.2)
    camera.lookAt(0, 0, 0)

    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "low" ? 1 : 2))

    const uniforms = {
      uTime:          { value: 0 },
      uAudioLow:      { value: 0.15 },
      uAudioMid:      { value: 0.15 },
      uAudioHigh:     { value: 0.1 },
      uActivityLevel: { value: 0.2 },
    }

    // ── Full moon / sphere distribution ──
    // Uniform volume sphere so the whole disk looks filled from the front
    const positions: number[] = []
    const seeds:     number[] = []

    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      // cube-root gives uniform sphere volume (no center crowding)
      const r     = Math.pow(Math.random(), 1 / 3) * 1.0
      positions.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi),
      )
      seeds.push(Math.random())
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute("aSeed",    new THREE.Float32BufferAttribute(seeds,     1))

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
      clock: 0, activityLevel: 0.2, targetActivity: 0.2, smoothAudio: 0,
    }

    // Subtle parallax tilt on mouse move
    const onMove = (e: MouseEvent) => {
      const mx = (e.clientX / window.innerWidth)  * 2 - 1
      const my = (e.clientY / window.innerHeight) * 2 - 1
      camera.position.x = mx * 0.3
      camera.position.y = -my * 0.3
      camera.position.z = 3.2
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
      v.clock += 0.016
      v.uniforms.uTime.value = v.clock
      v.activityLevel += (v.targetActivity - v.activityLevel) * 0.05
      v.uniforms.uActivityLevel.value = v.activityLevel
      v.smoothAudio += (audioLevelRef.current - v.smoothAudio) * 0.15
      const al = v.smoothAudio
      v.uniforms.uAudioLow.value  = 0.1 + al * 0.25
      v.uniforms.uAudioMid.value  = 0.1 + al * 0.3
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
      try { renderer.dispose() } catch { }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!vizRef.current) return
    switch (state) {
      case "speaking":     vizRef.current.targetActivity = 1.0; break
      case "recording":    vizRef.current.targetActivity = 0.8; break
      case "thinking":
      case "transcribing": vizRef.current.targetActivity = 0.6; break
      default:             vizRef.current.targetActivity = 0.2; break
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
      style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", zIndex: 0 }}
    />
  )
}

export const ParticleVisualizer = memo(ParticleVisualizerInner)
