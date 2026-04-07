"use client"

export const runtime = "edge"

import { WaitlistLayout } from "@/components/waitlist/layout"
import { InputForm } from "@/components/waitlist/form"
import { joinWaitlist } from "./actions"

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function WaitlistPage() {
  // @ts-ignore
  // @ts-ignore
  return (
    <WaitlistLayout activeTab="waitlist">
      <div className="flex flex-col items-center gap-4 md:gap-6 text-center">
        {/* LED Brand Logo */}
        <div className="flex items-center justify-center mb-4 select-none">
          <svg width="120" height="28" viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg" className="w-auto h-6 md:h-7 opacity-80">
            <defs>
              <pattern id="led-waitlist" width="2" height="2" patternUnits="userSpaceOnUse">
                <rect x="0.25" y="0.25" width="1.5" height="1.5" rx="0.3" fill="rgba(255,255,255,1)" />
              </pattern>
              <mask id="text-mask-waitlist">
                <rect width="100%" height="100%" fill="black" />
                <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
                      fontSize="24" fontWeight="400" fontFamily="'VT323','Space Mono',monospace" fill="white" letterSpacing="4">
                  MISSI
                </text>
              </mask>
            </defs>
            {/* Glow layer */}
            <text x="50%" y="56%" dominantBaseline="middle" textAnchor="middle" 
                  fontSize="24" fontWeight="400" fontFamily="'VT323','Space Mono',monospace" fill="#ffffff" opacity="0.2" style={{ filter: "blur(3px)" }} letterSpacing="4">
              MISSI
            </text>
            <rect width="100%" height="100%" fill="url(#led-waitlist)" mask="url(#text-mask-waitlist)" />
          </svg>
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