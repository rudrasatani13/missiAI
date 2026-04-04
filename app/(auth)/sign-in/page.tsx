"use client"

import { SignIn } from "@clerk/nextjs"

export default function SignInPage() {
  return (
    <div 
      className="min-h-screen bg-black flex items-center justify-center px-4"
      data-testid="sign-in-page"
    >
      <SignIn 
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-black/80 border border-white/10 shadow-2xl",
            headerTitle: "text-white",
            headerSubtitle: "text-white/50",
            socialButtonsBlockButton: "bg-white/5 border-white/10 text-white hover:bg-white/10",
            formFieldLabel: "text-white/70",
            formFieldInput: "bg-white/5 border-white/10 text-white placeholder:text-white/30",
            footerActionLink: "text-white/60 hover:text-white",
            formButtonPrimary: "bg-white text-black hover:bg-white/90",
          },
        }}
        routing="hash"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/chat"
      />
    </div>
  )
}
