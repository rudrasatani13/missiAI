import React from "react";

export function LEDLogo({ className = "w-24 relative" }: { className?: string }) {
  return (
    <div className={`select-none flex justify-center relative z-10 led-logo-container ${className}`}>
      <svg className="w-full h-auto drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" viewBox="0 0 800 220">
        <defs>
          <style dangerouslySetInnerHTML={{
            __html: `
              @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&display=swap');
              @import url('https://fonts.googleapis.com/css2?family=VT323&display=swap');
            `
          }} />
          <pattern id="led-pattern-small" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="#ffffff" />
          </pattern>
          <pattern id="led-pattern-red-small" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="rgba(255, 60, 60, 1)" />
          </pattern>
          <pattern id="led-pattern-blue-small" width="6" height="4" patternUnits="userSpaceOnUse" patternTransform="translate(0, 2)">
            <rect x="0.5" y="0.5" width="5" height="3" rx="1" fill="rgba(60, 150, 255, 1)" />
          </pattern>
          <mask id="text-mask-small">
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

        <rect x="-1.5" width="100%" height="100%" fill="url(#led-pattern-red-small)" mask="url(#text-mask-small)" opacity="0.8" />
        <rect x="1.5" width="100%" height="100%" fill="url(#led-pattern-blue-small)" mask="url(#text-mask-small)" opacity="0.8" />
        
        <rect x="0" width="100%" height="100%" fill="url(#led-pattern-small)" mask="url(#text-mask-small)" />
      </svg>
    </div>
  );
}
