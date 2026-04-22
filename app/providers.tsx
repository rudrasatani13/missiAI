"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { SessionGuard } from "@/components/auth/SessionGuard"
import { AppearanceProvider } from "@/components/providers/AppearanceProvider"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        layout: {
          unsafe_disableDevelopmentModeWarnings: process.env.NODE_ENV !== "production",
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignOutUrl="/"
    >
      <AppearanceProvider>
        <SessionGuard>
          {children}
        </SessionGuard>
      </AppearanceProvider>
    </ClerkProvider>
  )
}
