"use server"

import { clerkClient } from "@clerk/nextjs/server"

export async function joinWaitlist(email: string) {
  try {
    const client = await clerkClient()

    // Ye line automatically user ka email Clerk ke Waitlist dashboard me add kar degi
    await client.waitlistEntries.create({ emailAddress: email })

    return { success: true }
  } catch (error: any) {
    console.error("Waitlist error:", error)
    return {
      success: false,
      error: error.errors?.[0]?.longMessage || error.message || "Failed to join waitlist. You might already be on it."
    }
  }
}