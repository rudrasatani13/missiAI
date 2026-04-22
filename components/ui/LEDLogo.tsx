import { useId } from "react";

export function LEDLogo({ className = "w-24 relative" }: { className?: string }) {
  const baseId = useId().replace(/:/g, "")
  const patternId = `${baseId}-led-pattern-small`
  const redPatternId = `${baseId}-led-pattern-red-small`
  const bluePatternId = `${baseId}-led-pattern-blue-small`
  const maskId = `${baseId}-text-mask-small`

  return (
    <div className={`select-none flex justify-center relative z-10 led-logo-container ${className}`}>
      <svg className="w-full h-auto drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" viewBox="0 0 800 220">
        <defs>
          <pattern id={patternId} width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="#ffffff" />
          </pattern>
          <pattern id={redPatternId} width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="rgba(255, 60, 60, 1)" />
          </pattern>
          <pattern id={bluePatternId} width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="rgba(60, 150, 255, 1)" />
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
              fontSize="220" fontWeight="400" fontFamily="'VT323', 'Share Tech Mono', monospace" fill="#ffffff" opacity="0.15" style={{ filter: "blur(12px)" }} letterSpacing="18">
          MISSI
        </text>
        <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
              fontSize="220" fontWeight="400" fontFamily="'VT323', 'Share Tech Mono', monospace" fill="#e0f2fe" opacity="0.3" style={{ filter: "blur(4px)" }} letterSpacing="18">
          MISSI
        </text>

        <rect x="-1.5" width="100%" height="100%" fill={`url(#${redPatternId})`} mask={`url(#${maskId})`} opacity="0.8" />
        <rect x="1.5" width="100%" height="100%" fill={`url(#${bluePatternId})`} mask={`url(#${maskId})`} opacity="0.8" />
        
        <rect x="0" width="100%" height="100%" fill={`url(#${patternId})`} mask={`url(#${maskId})`} />
      </svg>
    </div>
  );
}
