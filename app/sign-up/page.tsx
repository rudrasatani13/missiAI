"use client"

import { SignUp } from "@clerk/nextjs"
import { dark } from "@clerk/themes"

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <SignUp
        routing="hash"
        signInUrl="/login"
        appearance={{
          baseTheme: dark,
          elements: {
            rootBox: "mx-auto",
            card: "bg-zinc-950 border border-zinc-800 shadow-2xl",
            headerTitle: "text-white",
            headerSubtitle: "text-zinc-400",
            socialButtonsBlockButton:
              "bg-zinc-900 border border-zinc-700 text-white hover:bg-zinc-800",
            socialButtonsBlockButtonText: "text-white font-medium",
            formFieldLabel: "text-zinc-300",
            formFieldInput:
              "bg-zinc-900 border-zinc-700 text-white placeholder:text-zinc-500",
            footerActionLink: "text-white hover:text-zinc-300",
            footerActionText: "text-zinc-400",
            formButtonPrimary:
              "bg-white text-black hover:bg-zinc-200 font-medium",
            dividerLine: "bg-zinc-800",
            dividerText: "text-zinc-500",
            identityPreviewEditButton: "text-white",
            formFieldAction: "text-white",
            alertText: "text-zinc-300",
            formResendCodeLink: "text-white",
          },
        }}
        forceRedirectUrl="/chat"
      />
    </div>
  )
}
