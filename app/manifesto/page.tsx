"use client"

import { WaitlistLayout } from "@/components/waitlist/layout"
import Image from "next/image"

export default function ManifestoPage() {
  return (
    <WaitlistLayout activeTab="manifesto">
      <div className="flex flex-col gap-6 md:gap-8 text-left">
        {/* Protected Logo - Responsive sizing */}
        <div className="flex items-center justify-center mb-2 md:mb-4 relative select-none">
          {/* Transparent overlay to prevent right-click */}
          <div
            className="absolute inset-0 z-10"
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
          <Image
            src="/images/missiai-logo.png"
            alt="MissiAI"
            width={400}
            height={120}
            className="h-16 md:h-20 lg:h-24 w-auto object-contain brightness-0 invert select-none pointer-events-none"
            priority
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
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
          <div className="text-white text-2xl md:text-3xl font-script italic transform -rotate-2">Rudra S.</div>
          <div className="text-gray-400 text-xs">Rudra Satani, CEO&nbsp;@&nbsp;missiAI</div>
        </div>
      </div>
    </WaitlistLayout>
  )
}
