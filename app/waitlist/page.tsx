"use client"

import { WaitlistLayout } from "@/components/waitlist/layout"
import { InputForm } from "@/components/waitlist/form"
import Image from "next/image"
import { joinWaitlist } from "./actions"

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function WaitlistPage() {
  // @ts-ignore
  // @ts-ignore
  return (
    <WaitlistLayout activeTab="waitlist">
      <div className="flex flex-col items-center gap-4 md:gap-6 text-center">
        {/* Protected Logo - Responsive sizing */}
        <div className="flex items-center justify-center mb-2 md:mb-4 relative select-none">
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

        {/* Headline */}
        <h1 className="text-white text-lg md:text-xl lg:text-2xl font-medium leading-tight max-w-xs md:max-w-md px-2">
          The most powerful human AI assistant yet.
        </h1>

        {/* Description */}
        <p className="text-gray-400 text-xs md:text-sm leading-relaxed max-w-xs md:max-w-sm px-2">
          missiAI represents the pinnacle of AI advancement, delivering unprecedented intelligence, capability, and
          human-like interaction. Experience the future of Human-AI assistance today.
        </p>

        {/* Waitlist Form */}
        <div className="w-full max-w-xs md:max-w-sm mt-2 md:mt-4">
          <InputForm
            buttonCopy={{
              idle: "Join waitlist",
              success: "Welcome aboard!",
              loading: "Joining...",
            }}
            formAction={async (data) => {
              const email = (data.get("email") as string)?.trim()

              // Proper email validation
              if (!email || !EMAIL_REGEX.test(email)) {
                return {
                  success: false as const,
                  error: "Please enter a valid email address",
                }
              }

              // Email sanitization - remove any potentially harmful characters
              const sanitizedEmail = email.toLowerCase().replace(/[<>]/g, "")

              const result = await joinWaitlist(sanitizedEmail)
              return result as { success: true } | { success: false; error: string }
            }}
            name="email"
            type="email"
            placeholder="Your work email"
            required
          />
        </div>
      </div>
    </WaitlistLayout>
  )
}