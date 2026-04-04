"use client"

import { WaitlistLayout } from "@/components/waitlist/layout"

export default function ManifestoPage() {
  return (
    <WaitlistLayout activeTab="manifesto">
      <div className="flex flex-col gap-6 md:gap-8 text-left">
        {/* LED Brand Logo */}
        <div className="flex items-center justify-center mb-4 select-none">
          <svg width="120" height="28" viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg" className="w-auto h-6 md:h-7 opacity-80">
            <defs>
              <pattern id="led-manifesto" width="2" height="2" patternUnits="userSpaceOnUse">
                <rect x="0.25" y="0.25" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,1)" />
              </pattern>
              <mask id="text-mask-manifesto">
                <rect width="100%" height="100%" fill="black" />
                <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
                      fontSize="24" fontWeight="400" fontFamily="'VT323','Share Tech Mono',monospace" fill="white" letterSpacing="4">
                  MISSI
                </text>
              </mask>
            </defs>
            {/* Glow layer */}
            <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
                  fontSize="24" fontWeight="400" fontFamily="'VT323','Share Tech Mono',monospace" fill="#ffffff" opacity="0.2" style={{ filter: "blur(3px)" }} letterSpacing="4">
              MISSI
            </text>
            <rect width="100%" height="100%" fill="url(#led-manifesto)" mask="url(#text-mask-manifesto)" />
          </svg>
        </div>

        {/* Manifesto Content - Responsive text sizing */}
        <div className="text-gray-200 text-xs md:text-sm leading-relaxed space-y-3 md:space-y-4 font-light">
          <p>
            At missiAI, we believe that artificial intelligence should transcend current limitations and redefine what's
            possible. Our mission is to create the most advanced human AI assistant ever built—one that doesn't just
            respond, but truly understands, anticipates, and evolves with human needs.
          </p>

          <p>
            We envision a future where AI doesn't just process information, but demonstrates genuine intelligence,
            creativity, and problem-solving capabilities that rival and complement human cognition. Our platform
            represents a quantum leap in AI technology, delivering unprecedented performance, sophistication, and
            human-like interaction.
          </p>

          <p>
            Built for visionaries, innovators, and those who demand excellence, missiAI is designed to push the
            boundaries of what AI can achieve. We're not just building another assistant—we're crafting the future of
            human-AI collaboration, where intelligence knows no bounds.
          </p>
        </div>

        {/* Signature - Responsive sizing */}
        <div className="flex flex-col gap-1 mt-6 md:mt-8">
          <div className="text-white text-2xl md:text-3xl italic transform -rotate-2" style={{ fontFamily: "var(--font-dancing-script), cursive" }}>Rudra S.</div>
          <div className="text-gray-400 text-xs">Rudra Satani, CEO&nbsp;@&nbsp;missiAI</div>
        </div>
      </div>
    </WaitlistLayout>
  )
}
