"use server"

import { clerkClient } from "@clerk/nextjs/server"
import { z } from "zod"
import { sanitizeInput } from "@/lib/validation/sanitizer"

const waitlistEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Please enter a valid email address")
  .max(255, "Email address is too long")
  .transform(sanitizeInput)

export async function joinWaitlist(email: string) {
  try {
    const parseResult = waitlistEmailSchema.safeParse(email)

    if (!parseResult.success) {
      return {
        success: false,
        error: parseResult.error.errors[0]?.message || "Invalid email address"
      }
    }

    const finalEmail = parseResult.data

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