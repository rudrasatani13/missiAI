import { runReferralGetRoute, runReferralPostRoute } from '@/lib/server/routes/referral/runner'

// GET /api/v1/referral — Get user's referral code and stats
export async function GET() {
  return runReferralGetRoute()
}

// POST /api/v1/referral — Track a referral (called when user visits with ?ref= and is logged in)
export async function POST(req: Request) {
  return runReferralPostRoute(req)
}
