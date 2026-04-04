"use client"

import { SignUp } from "@clerk/nextjs"

export default function SignUpPage() {
  return (
    <div 
      className="min-h-screen bg-black flex items-center justify-center px-4"
      data-testid="sign-up-page"
    >
      <SignUp 
        appearance={{
          variables: {
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            colorPrimary: '#ffffff',
            colorBackground: '#0a0a0a',
            colorText: '#ffffff',
            colorInputBackground: '#0a0a0a',
            colorInputText: '#ffffff',
            borderRadius: '0.25rem',
          },
          elements: {
            rootBox: "mx-auto clerk-form-container",
            card: "bg-black border border-white/10 shadow-[0_0_40px_rgba(255,255,255,0.05)]",
            headerTitle: "text-white text-xl uppercase tracking-widest",
            headerSubtitle: "text-white/50 text-xs",
            socialButtonsBlockButton: "bg-black border border-white/10 text-white hover:bg-white/10 hover:border-white/20 transition-all rounded-sm",
            socialButtonsBlockButtonText: "font-medium tracking-wide",
            formFieldLabel: "text-white/50 uppercase tracking-widest text-[10px]",
            formFieldInput: "bg-black border-white/10 text-white placeholder:text-white/20 focus:border-white/50 transition-colors rounded-sm rounded-none",
            footerActionLink: "text-white hover:text-white/80 underline decoration-white/30 underline-offset-4",
            footerActionText: "text-white/40",
            formButtonPrimary: "bg-white text-black hover:bg-white/90 rounded-sm font-bold tracking-widest uppercase transition-all",
            formFieldSuccessText: "text-green-400",
            formFieldErrorText: "text-red-400 text-xs",
          },
        }}
        routing="hash"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/chat"
      />
    </div>
  )
}
