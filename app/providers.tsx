"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
      }}
    >
      {children}
    </ClerkProvider>
  )
}
