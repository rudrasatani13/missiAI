"use client"

import MissiAIParticles from "../missi-ai-particles"
import Link from "next/link"
import Image from "next/image"

export default function Page() {
  return (
    <div className="relative">
      <MissiAIParticles />

      {/* Protected Logo in top-left corner */}
      <div className="absolute top-8 left-8 z-10">
        <Link href="/" className="block">
          <div className="relative w-12 h-12 select-none">
            {/* Transparent overlay to prevent right-click */}
            <div
              className="absolute inset-0 z-10 cursor-pointer"
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
            <Image
              src="/images/logo-symbol.png"
              alt="missiAI Logo"
              width={48}
              height={48}
              className="w-12 h-12 opacity-80 hover:opacity-100 transition-opacity duration-300 select-none pointer-events-none"
              priority
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
              onDragStart={(e) => e.preventDefault()}
            />
          </div>
        </Link>
      </div>

      {/* Navigation to Waitlist */}
      <div className="absolute top-8 right-8 z-10">
        <Link
          href="/waitlist"
          className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm text-white text-sm rounded-full border border-white/20 hover:bg-white/20 transition-all duration-300"
        >
          Join Waitlist
        </Link>
      </div>
    </div>
  )
}
