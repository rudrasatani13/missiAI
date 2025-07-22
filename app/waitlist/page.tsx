"use client"

import { WaitlistLayout } from "@/components/waitlist/layout"
import { InputForm } from "@/components/waitlist/form"
import Image from "next/image"

export default function WaitlistPage() {
  return (
    <WaitlistLayout activeTab="waitlist">
      <div className="flex flex-col items-center gap-6 text-center">
        {/* Protected Logo */}
        <div className="flex items-center justify-center mb-4 relative select-none">
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
            className="h-24 w-auto object-contain brightness-0 invert select-none pointer-events-none"
            priority
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
          />
        </div>

        {/* Headline */}
        <h1 className="text-white text-2xl font-medium leading-tight max-w-md">
          The most powerful human AI assistant yet.
        </h1>

        {/* Description */}
        <p className="text-gray-400 text-sm leading-relaxed max-w-sm">
          missiAI represents the pinnacle of AI advancement, delivering unprecedented intelligence, capability, and
          human-like interaction. Experience the future of AI assistance today.
        </p>

        {/* Waitlist Form */}
        <div className="w-full max-w-sm mt-4">
          <InputForm
            buttonCopy={{
              idle: "Join waitlist",
              success: "Welcome aboard!",
              loading: "Joining...",
            }}
            formAction={async (data) => {
              try {
                const email = data.get("email") as string

                if (!email || !email.includes("@")) {
                  return {
                    success: false,
                    error: "Please enter a valid email address",
                  }
                }

                // Here you would save to database
                console.log("New waitlist signup:", email)
                return { success: true }
              } catch (error) {
                console.error(error)
                return {
                  success: false,
                  error: "There was an error while submitting the form",
                }
              }
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
