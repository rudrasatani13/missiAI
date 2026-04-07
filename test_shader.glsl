    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    
    // Core: extremely bright, small center
    float core = exp(-dist * dist * 120.0);
    
    // Inner Glow: intense light near the core
    float innerGlow = exp(-dist * dist * 30.0);
    
    // Outer Glow: very soft light that reaches the edge of the particle
    float outerGlow = exp(-dist * dist * 8.0);
    
    // Combine layers to form a realistic bloom
    float intensity = core * 2.0 + innerGlow * 1.0 + outerGlow * 0.3;
    intensity *= (0.8 + vAudioMid * 0.5); // React to audio

    // Core is pure white, rest fades into particle's base color
    vec3 lightColor = mix(vColor, vec3(1.0), core);
    vec3 finalColor = lightColor * intensity;

    // For additive blending, we usually use premultiplied alpha style,
    // or just let the alpha control the weight. We want strong addition.
    float alpha = smoothstep(0.5, 0.0, dist) * intensity;
    
    // Enhance contrast of alpha
    alpha = pow(alpha, 0.8);
    
    if (alpha <= 0.01) discard;

    gl_FragColor = vec4(finalColor, alpha * 0.6);
