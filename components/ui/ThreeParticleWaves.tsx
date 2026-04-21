"use client"

import { memo, useRef, useEffect } from "react"
import * as THREE from "three"

function getQualityTier(): "low" | "high" {
  if (typeof navigator !== "undefined" && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) return "low"
  const cores = navigator.hardwareConcurrency || 2
  const memory = (navigator as any).deviceMemory || 4
  if (cores <= 4 || memory <= 4) return "low"
  return "high"
}

// Slightly modified shader to optimize for a flat horizontal wave instead of a sphere
const VERTEX_SHADER = `
  uniform float uTime;
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
    float timeScale = 0.15;
    
    // Wave calculations
    vec3 curl = curlNoise(position * 0.3 + uTime * timeScale);
    float waveHeight = snoise(vec3(position.x * 0.3, uTime * 0.4, position.z * 0.3)) * 1.5;
    
    // Base position
    vec3 displaced = position;
    
    // Add wave height (y-axis)
    displaced.y += waveHeight;
    
    // Add curl noise for organic feeling
    displaced += curl * 0.5;

    // Use same colors as the chat visualizer for brand consistency
    vec3 baseColor = vec3(
      0.65 + 0.35 * sin(curl.y + 2.0),
      0.65 + 0.35 * sin(uTime * timeScale + curl.y),
      0.75 + 0.25 * sin(uTime * timeScale * 0.1 + curl.z + 4.0)
    );
    
    // Add an orange/red tint based on user's preference while keeping the shiny aesthetic
    vec3 waveColor = mix(baseColor, vec3(1.0, 0.4, 0.1), 0.3);
    
    vColor = waveColor * 1.5; // boost overall luminance
    vAudioMid = 1.0; // max out soft glow for extreme brightness

    vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Particles get smaller in the distance, but keep baseline thick
    gl_PointSize = (8.0 * (1.0 / -mvPosition.z));
  }
`

const FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAudioMid;
  void main() {
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Soft particle edge
    float softness = 0.45 + vAudioMid * 0.1;
    float edge = 0.5;
    if (dist > edge) discard;
    
    float alpha = 1.0 - smoothstep(softness, edge, dist);
    float innerGlow = 1.0 - smoothstep(0.0, 0.25, dist);
    
    vec3 finalColor = mix(vColor, vColor * 0.5, innerGlow * vAudioMid);
    gl_FragColor = vec4(finalColor * 1.4, alpha);
  }
`

export function ThreeParticleWaves() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const vizRef = useRef<{
    scene: THREE.Scene
    camera: THREE.PerspectiveCamera
    renderer: THREE.WebGLRenderer
    particles: THREE.Points
    uniforms: Record<string, { value: number }>
    clock: number
  } | null>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const quality = getQualityTier()
    const particleCount = quality === "low" ? 3000 : 8000

    let renderer: THREE.WebGLRenderer

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: quality === "high",
        alpha: true,
        powerPreference: "default",
      })
    } catch {
      return
    }

    const scene = new THREE.Scene()
    // No background, we want it transparent to overlay on the auth UI
    
    const camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    )
    
    // Position camera to look down the wave plane
    camera.position.z = 8
    camera.position.y = 2
    camera.position.x = 0
    camera.lookAt(0, 0, 0)

    renderer.setSize(window.innerWidth, window.innerHeight, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === "low" ? 1 : 2))

    const uniforms = {
      uTime: { value: 0 },
    }

    const geometry = new THREE.BufferGeometry()
    const positions: number[] = []

    // Create a horizontal flat grid that will be warped by the vertex shader
    // Spread X vastly across screen, Z backwards for depth
    for (let i = 0; i < particleCount; i++) {
        const x = (Math.random() - 0.5) * 40.0 // wide spread
        const z = (Math.random() - 0.5) * 15.0 // deep spread
        const y = 0
        positions.push(x, y, z)
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending, // the glowing magic effect
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
    }

    // Gentle camera parallax tied to mouse to add life
    const onMove = (e: MouseEvent) => {
      const mx = (e.clientX / window.innerWidth) * 2 - 1
      const my = -(e.clientY / window.innerHeight) * 2 + 1
      camera.position.x += (mx * 2 - camera.position.x) * 0.05
      camera.position.y += (my * 1 + 2 - camera.position.y) * 0.05
      camera.lookAt(0, 0, 0)
    }
    document.addEventListener("mousemove", onMove)

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight, false)
    }
    window.addEventListener("resize", onResize)

    const animate = () => {
      const v = vizRef.current
      if (!v) return
      
      v.clock += 0.016
      v.uniforms.uTime.value = v.clock
      
      // Rotate the entire particle cloud very slowly
      v.particles.rotation.y += 0.001
      
      v.renderer.render(v.scene, v.camera)
      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      document.removeEventListener("mousemove", onMove)
      window.removeEventListener("resize", onResize)
      try { renderer.dispose() } catch {}
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  )
}
