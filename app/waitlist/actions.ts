"use server"

import { clerkClient } from "@clerk/nextjs/server"

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function joinWaitlist(email: string) {
  try {
    // Server-side validation (important for security)
    const sanitizedEmail = email.trim().toLowerCase()

    if (!sanitizedEmail || !EMAIL_REGEX.test(sanitizedEmail)) {
      return {
        success: false,
        error: "Invalid email address"
      }
    }

    // Additional sanitization - remove potentially harmful characters
    const finalEmail = sanitizedEmail.replace(/[<>]/g, "")

    const client = await clerkClient()

    // Ye line automatically user ka email Clerk ke Waitlist dashboard me add kar degi
    await client.waitlistEntries.create({ emailAddress: finalEmail })

    return { success: true }
  } catch (error: unknown) {
    console.error("Waitlist error:", error)

    const errorMessage = error && typeof error === "object" && "errors" in error
      ? (error as any).errors?.[0]?.longMessage
      : error instanceof Error
        ? error.message
        : "Failed to join waitlist. You might already be on it."

    return {
      success: false,
      error: errorMessage
    }
  }
}