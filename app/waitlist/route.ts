import { NextRequest } from "next/server"

export const runtime = "edge"

// Simple in-memory storage for waitlist emails
// In production, replace with a database (Supabase, Planetscale, etc.)
// For now, this accepts the email and returns success
// Emails are logged server-side for manual collection

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || !email.includes("@")) {
      return new Response(
        JSON.stringify({ success: false, error: "Please enter a valid email address" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      )
    }

    // Log the email server-side (visible in Cloudflare dashboard logs)
    console.log(`[WAITLIST] New signup: ${email} at ${new Date().toISOString()}`)

    // TODO: When you add a database, save the email here
    // Example with Supabase:
    // await supabase.from("waitlist").insert({ email, created_at: new Date() })

    return new Response(
      JSON.stringify({ success: true, message: "Welcome aboard!" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("[WAITLIST] Error:", err)
    return new Response(
      JSON.stringify({ success: false, error: "Something went wrong. Please try again." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
}