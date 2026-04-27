import { runActionsGetRoute, runActionsPostRoute } from "@/lib/server/routes/actions/runner"

export async function POST(req: Request) {
  // OWASP API4: rate-limit action detection — each call invokes Gemini
  // Save reminders and notes to KV
  // Analytics: fire-and-forget (H1 fix: wrap in waitUntil)
  return runActionsPostRoute(req)
}

export async function GET() {
  // OWASP API4: rate-limit reads to prevent bulk history scraping
  return runActionsGetRoute()
}
