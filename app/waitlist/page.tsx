"use client"

import { Waitlist } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function WaitlistPage() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4 relative overflow-hidden" style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>

      {/* Background Starfield Effect (Subtle) */}
      <div className="absolute inset-0 w-full h-full z-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] opacity-20"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 70%)" }} />
      </div>

      {/* Top Nav */}
      <nav className="absolute top-0 left-0 w-full flex items-center p-6 md:p-8 z-20">
        <Link href="/" className="flex items-center gap-2 opacity-50 hover:opacity-100 transition-opacity text-white">
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs font-light tracking-wide">Back to Home</span>
        </Link>
      </nav>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-1000">

        {/* Clerk's Built-in Waitlist Component */}
        <Waitlist
          signInUrl="/login"
          appearance={{
            baseTheme: dark,
            elements: {
              card: "bg-white/5 border border-white/10 shadow-2xl backdrop-blur-xl rounded-2xl w-full",
              // FIX: Hidden hata kar native title/subtitle ko style kiya hai taaki success message dikhe
              headerTitle: "text-white font-semibold text-2xl tracking-tight text-center",
              headerSubtitle: "text-white/50 font-light text-sm text-center mb-2",
              socialButtonsBlockButton: "bg-white/5 border-white/10 hover:bg-white/10 text-white transition-colors",
              formButtonPrimary: "bg-white text-black hover:bg-white/90 transition-all rounded-full font-medium py-2.5 mt-2",
              formFieldInput: "bg-white/5 border-white/10 text-white focus:border-white/30 rounded-xl",
              formFieldLabel: "text-white/70 font-light",
              dividerLine: "bg-white/10",
              dividerText: "text-white/40",
              footerActionLink: "text-white/70 hover:text-white transition-colors",
              footerActionText: "text-white/40"
            }
          }}
        />
      </div>
    </div>
  )
}