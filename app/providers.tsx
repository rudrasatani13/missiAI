"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { SessionGuard } from "@/components/auth/SessionGuard"
import { AppearanceProvider } from "@/components/providers/AppearanceProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        layout: {
          unsafe_disableDevelopmentModeWarnings: process.env.NODE_ENV !== "production",
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/chat"
    >
      <AppearanceProvider>
        <SessionGuard>
          {children}
        </SessionGuard>
      </AppearanceProvider>
    </ClerkProvider>
  )
}
