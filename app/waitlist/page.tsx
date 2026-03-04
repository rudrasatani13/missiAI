"use client"

import { WaitlistLayout } from "@/components/waitlist/layout"
import { InputForm } from "@/components/waitlist/form"
import Image from "next/image"
import { joinWaitlist } from "./actions"
import { toast } from "sonner" // 👈 Popup notification import kiya gaya hai

export default function WaitlistPage() {
  return (
    <WaitlistLayout activeTab="waitlist">
      <div className="flex flex-col items-center gap-4 md:gap-6 text-center">
        {/* Protected Logo */}
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
        <p className="text-zinc-400 text-xs md:text-sm leading-relaxed max-w-xs md:max-w-sm px-2">
          missiAI represents the pinnacle of AI advancement, delivering unprecedented intelligence, capability, and
          human-like interaction. Experience the future of Human-AI assistance today.
        </p>

        {/* Waitlist Form with Toasts */}
        <div className="w-full max-w-xs md:max-w-sm mt-2 md:mt-4">
          <InputForm
            buttonCopy={{
              idle: "Join waitlist",
              success: "Welcome aboard!",
              loading: "Joining...",
            }}
            formAction={async (data) => {
              try {
                const email = data.get("email") as string

                // 🚨 Invalid Email Popup
                if (!email || !email.includes("@")) {
                  toast.error("Invalid Email", {
                    description: "Please enter a valid email address.",
                  })
                  return {
                    success: false,
                    error: "Please enter a valid email address",
                  }
                }

                const res = await joinWaitlist(email)

                // 🚨 Server Error / Already Joined Popup
                if (!res.success) {
                  toast.error("Notice", {
                    description: res.error as string,
                  })
                  return {
                    success: false,
                    error: res.error as string,
                  }
                }

                // ✅ SUCCESS POPUP (Yeh sabse important hai)
                toast.success("Thank you for joining!", {
                  description: "You have been successfully added to the missiAI waitlist. We will email you soon.",
                })

                console.log("New waitlist signup successful:", email)
                return { success: true }

              } catch (error) {
                console.error(error)
                // 🚨 Catch-all Error Popup
                toast.error("Oops!", {
                  description: "Something went wrong. Please try again.",
                })
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