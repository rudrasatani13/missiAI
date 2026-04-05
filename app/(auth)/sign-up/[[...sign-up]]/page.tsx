"use client"

import { SignUp } from "@clerk/nextjs"

export const runtime = 'edge'

export default function SignUpPage() {
  return (
    <div 
      className="min-h-screen bg-black flex items-center justify-center px-4"
      data-testid="sign-up-page"
    >
      <SignUp 
        appearance={{
          variables: {
            fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            colorPrimary: '#ffffff',
            colorBackground: '#000000',
            colorText: '#ffffff',
            colorInputBackground: '#0a0a0a',
            colorInputText: '#ffffff',
            borderRadius: '0.5rem',
          },
          elements: {
            rootBox: "mx-auto clerk-form-container",
            card: "bg-black/90 border border-white/10 shadow-2xl backdrop-blur-xl",
            headerTitle: "text-white text-2xl font-semibold tracking-tight",
            headerSubtitle: "text-white/60 text-sm",
            socialButtonsBlockButton: "bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-white/20 transition-all rounded-lg h-11",
            socialButtonsBlockButtonText: "font-medium",
            formFieldLabel: "text-white/80 font-medium text-sm",
            formFieldInput: "bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-white/40 transition-all rounded-lg h-11 px-4",
            footerActionLink: "text-white hover:text-white/80 font-medium",
            footerActionText: "text-white/50",
            formButtonPrimary: "bg-white text-black hover:bg-white/90 rounded-lg font-medium transition-all h-11",
            formFieldSuccessText: "text-green-400",
            formFieldErrorText: "text-red-400 text-xs",
            dividerLine: "bg-white/10",
            dividerText: "text-white/40",
            // Mobile-critical: ensure OTP/verification elements are visible
            otpCodeFieldInput: "bg-white/5 border-white/10 text-white text-center text-lg h-12",
            formResendCodeLink: "text-white/70 hover:text-white",
            identityPreviewEditButton: "text-white/70 hover:text-white",
            alertText: "text-white/80",
            // Ensure loading spinners are visible
            spinner: "text-white",
            // Fix button states on mobile
            formButtonPrimary__loading: "opacity-80",
          },
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/chat"
      />
    </div>
  )
}
