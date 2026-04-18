"use client"

import { SignIn, useUser } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import Link from "next/link"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LEDLogo } from "@/components/ui/LEDLogo"

export default function SignInPage() {
  const [mounted, setMounted] = useState(false)
  const { isSignedIn, isLoaded } = useUser()
  const router = useRouter()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Redirect authenticated users to /chat
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/chat")
    }
  }, [isLoaded, isSignedIn, router])

  if (!mounted || (isLoaded && isSignedIn)) return null

  return (
    <div
      className="min-h-screen bg-[#070708] flex relative overflow-hidden"
      data-testid="sign-in-page"
    >
      
      {/* Header Logo */}
      <div className="absolute top-6 left-6 z-20">
        <Link href="/">
          <LEDLogo />
        </Link>
      </div>

      {/* ──────────────── CENTERED FORM ──────────────── */}
      <div className="w-full h-full flex flex-col relative z-10 items-center justify-center p-6 min-h-screen">
        <div
          className={`w-full max-w-[380px] flex flex-col transition-all duration-700 delay-100 ${
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"
          }`}
        >
          {/* Heading */}
          <div className="mb-8 text-center">
            <h1 className="text-[28px] font-semibold text-white tracking-tight">
              Welcome back
            </h1>
            <p className="text-white/40 text-[14px] mt-2 font-light">
              Log in to missiAI to continue.
            </p>
          </div>

          <div className="w-full mt-2">
            <SignIn
              routing="hash"
              signUpUrl="/sign-up"
              forceRedirectUrl="/chat"
              fallbackRedirectUrl="/chat"
              appearance={{
                baseTheme: dark,
                layout: {
                  logoPlacement: "none",
                  socialButtonsPlacement: "top",
                },
                variables: {
                  colorPrimary: '#ffffff',
                  colorBackground: 'transparent',
                  colorText: '#ffffff',
                  colorInputBackground: 'rgba(255,255,255,0.02)',
                  colorInputText: '#ffffff',
                  borderRadius: '0.5rem',
                },
                elements: {
                  card: "bg-transparent shadow-none w-full",
                  header: "hidden",
                  footerAction: "hidden",
                  formButtonPrimary: "text-black bg-white hover:bg-white/90 cursor-pointer",
                  socialButtonsBlockButton: "border border-white/10 text-white hover:bg-white/5 cursor-pointer",
                  formFieldInput: "border border-white/10 focus:border-white/30 text-white cursor-pointer",
                  dividerLine: "bg-white/10",
                  identityPreview: "border border-white/10 cursor-pointer",
                },
              }}
            />
            
            {/* Custom Sign Up link */}
            <div className="mt-8 text-center">
               <p className="text-white/40 text-[13px]">
                 Don't have an account? <Link href="/sign-up" className="text-white hover:text-white/80 underline underline-offset-2">Sign up</Link>
               </p>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 text-center w-full max-w-[380px]">
          <p className="text-white/10 text-[11px] font-normal tracking-wide">
            Protected by enterprise-grade encryption
          </p>
        </div>
      </div>
    </div>
  )
}
