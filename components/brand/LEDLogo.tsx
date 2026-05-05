"use client"

import { useId, useEffect, useState } from "react";

export function LEDLogo({ className = "w-24 relative" }: { className?: string }) {
  const baseId = useId().replace(/:/g, "")
  const patternId = `${baseId}-led-pattern-small`
  const redPatternId = `${baseId}-led-pattern-red-small`
  const bluePatternId = `${baseId}-led-pattern-blue-small`
  const maskId = `${baseId}-text-mask-small`

  const [isLight, setIsLight] = useState(false)

  useEffect(() => {
    const check = () => setIsLight(
      document.documentElement.getAttribute("data-theme") === "light"
    )
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] })
    return () => obs.disconnect()
  }, [])

  // Dark mode: white LED dots with chromatic aberration glow
  // Light mode: deep navy LED dots (#0f172a) with subtle dark glow
  const dotColor   = isLight ? "#0f172a" : "#ffffff"
  const aberrRed   = isLight ? "rgba(30, 58, 138, 0.9)"  : "rgba(255, 60, 60, 1)"
  const aberrBlue  = isLight ? "rgba(99, 102, 241, 0.9)" : "rgba(60, 150, 255, 1)"
  const glowBlur12 = isLight ? "#0f172a" : "#ffffff"
  const glowBlur4  = isLight ? "#1e3a8a" : "#e0f2fe"
  const glowOpacity12 = isLight ? 0.08 : 0.15
  const glowOpacity4  = isLight ? 0.18 : 0.30
  const dropShadow = isLight
    ? "drop-shadow-[0_0_6px_rgba(15,23,42,0.25)]"
    : "drop-shadow-[0_0_8px_var(--missi-text-muted)]"

  return (
    <div className={`select-none flex justify-center relative z-10 led-logo-container ${className}`}>
      <svg className={`w-full h-auto ${dropShadow}`} viewBox="0 0 800 220">
        <defs>
          <pattern id={patternId} width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill={dotColor} />
          </pattern>
          <pattern id={redPatternId} width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill={aberrRed} />
          </pattern>
          <pattern id={bluePatternId} width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill={aberrBlue} />
          </pattern>
          <mask id={maskId}>
            <rect width="100%" height="100%" fill="black" />
            <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
                  fontSize="220" fontWeight="400" fontFamily="'VT323', 'Share Tech Mono', monospace" fill="white" letterSpacing="18">
              MISSI
            </text>
          </mask>
        </defs>

        <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
              fontSize="220" fontWeight="400" fontFamily="'VT323', 'Share Tech Mono', monospace" fill={glowBlur12} opacity={glowOpacity12} style={{ filter: "blur(12px)" }} letterSpacing="18">
          MISSI
        </text>
        <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle"
              fontSize="220" fontWeight="400" fontFamily="'VT323', 'Share Tech Mono', monospace" fill={glowBlur4} opacity={glowOpacity4} style={{ filter: "blur(4px)" }} letterSpacing="18">
          MISSI
        </text>

        <rect x="-1.5" width="100%" height="100%" fill={`url(#${redPatternId})`} mask={`url(#${maskId})`} opacity="0.8" />
        <rect x="1.5" width="100%" height="100%" fill={`url(#${bluePatternId})`} mask={`url(#${maskId})`} opacity="0.8" />

        <rect x="0" width="100%" height="100%" fill={`url(#${patternId})`} mask={`url(#${maskId})`} />
      </svg>
    </div>
  );
}
