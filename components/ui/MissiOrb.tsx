"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export function MissiOrb({ isSpeaking = false, className = "" }: { isSpeaking?: boolean, className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const isSpeakingRef = useRef(isSpeaking);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 4;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "default" });
    
    // Size management
    const updateSize = () => {
      const width = mountRef.current?.clientWidth || 256;
      const height = mountRef.current?.clientHeight || 256;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    updateSize();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Clear and append safely
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // Particle Ring Setup
    const particleCount = 8000;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const randoms = new Float32Array(particleCount);
    const angles = new Float32Array(particleCount);

    const baseRadius = 1.2;
    
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      // Spread them around a circle
      const angle = Math.random() * Math.PI * 2;
      
      // Gaussian center cluster focus
      const rRandom = Math.random();
      const r = baseRadius + (rRandom * rRandom - 0.5) * 0.4; 
      
      positions[i3] = Math.cos(angle) * r;
      positions[i3 + 1] = Math.sin(angle) * r;
      positions[i3 + 2] = (Math.random() - 0.5) * 0.2; // slight z depth

      angles[i] = angle;
      randoms[i] = Math.random();
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uSpeaking: { value: 0 }, // 0 to 1
        uColor: { value: new THREE.Color("#ffffff") }, // white core
        uGlow: { value: new THREE.Color("#00ff9d") } // greenish-cyan neon glow to match vibe
      },
      vertexShader: `
        uniform float uTime;
        uniform float uSpeaking;
        attribute float aRandom;
        attribute float aAngle;
        
        varying float vAlpha;
        varying vec3 vPos;

        // Classic Simplex 3D Noise 
        vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
        vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
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
          i = mod(i, 289.0);
          vec4 p = permute( permute( permute( 
                     i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                   + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                   + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
          float n_ = 1.0/7.0; 
          vec3 ns = n_ * D.wyz - D.xzx;
          vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
          vec4 x_ = floor(j * ns.z);
          vec4 y_ = floor(j - 7.0 * x_);
          vec4 x2_ = x_ *ns.x + ns.yyyy;
          vec4 y2_ = y_ *ns.x + ns.yyyy;
          vec4 h = 1.0 - abs(x2_) - abs(y2_);
          vec4 b0 = vec4( x2_.xy, y2_.xy );
          vec4 b1 = vec4( x2_.zw, y2_.zw );
          vec4 s0 = floor(b0)*2.0 + 1.0;
          vec4 s1 = floor(b1)*2.0 + 1.0;
          vec4 sh = -step(h, vec4(0.0));
          vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
          vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
          vec3 p0 = vec3(a0.xy,h.x);
          vec3 p1 = vec3(a0.zw,h.y);
          vec3 p2 = vec3(a1.xy,h.z);
          vec3 p3 = vec3(a1.zw,h.w);
          vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
          p0 *= norm.x;
          p1 *= norm.y;
          p2 *= norm.z;
          p3 *= norm.w;
          vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
          m = m * m;
          return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
        }

        void main() {
          float speed = uTime * (0.3 + uSpeaking * 1.5);
          
          // Noise scale pushes particles outward radially
          float n = snoise(vec3(position.xy * 1.5, speed));
          
          // Base position
          vec3 pos = position;
          
          // Displace outward based on noise and speaking volume
          float displacement = n * (0.3 + uSpeaking * 0.8) * aRandom;
          pos.x += cos(aAngle) * displacement;
          pos.y += sin(aAngle) * displacement;
          
          // Add some z-wobble
          pos.z += snoise(vec3(pos.x, pos.y, speed)) * (0.2 + uSpeaking * 0.5);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          
          vPos = pos;
          
          // Size varies based on speaking and random depth
          gl_PointSize = (2.0 + uSpeaking * 3.5 + aRandom * 2.0) * (2.0 / -mvPosition.z);
          vAlpha = 0.4 + aRandom * 0.6;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform vec3 uGlow;
        uniform float uSpeaking;
        
        varying float vAlpha;
        varying vec3 vPos;
        
        void main() {
          // Circular particle shape
          float dist = length(gl_PointCoord - vec2(0.5));
          if (dist > 0.5) discard;
          
          // Mix color based on outward displacement
          float rad = length(vPos.xy);
          float mixLevel = smoothstep(1.0, 1.5, rad);
          vec3 finalColor = mix(uColor, uGlow, mixLevel + uSpeaking * 0.5);
          
          float softEdge = 1.0 - (dist * 2.0);
          gl_FragColor = vec4(finalColor, vAlpha * softEdge);
        }
      `
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const clock = new THREE.Clock();
    let currentSpeakingTarget = 0;

    const animate = () => {
      requestAnimationFrame(animate);
      
      const elapsed = clock.getElapsedTime();
      
      // Interpolate speaking value smoothly
      const target = isSpeakingRef.current ? 1.0 : 0.0;
      currentSpeakingTarget += (target - currentSpeakingTarget) * 0.08;
     
     material.uniforms.uTime.value = elapsed;
     material.uniforms.uSpeaking.value = currentSpeakingTarget;
     
     // Slowly rotate the entire ring
     particles.rotation.z = elapsed * 0.15;

     renderer.render(scene, camera);
    };

    const animId = requestAnimationFrame(animate);

    const handleResize = () => {
      updateSize();
    };
    window.addEventListener("resize", handleResize);
    const mountEl = mountRef.current;

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      if (mountEl) {
        mountEl.innerHTML = "";
      }
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, []);

  return <div ref={mountRef} className={`w-full h-full flex items-center justify-center ${className}`} />;
}
