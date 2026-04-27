import {
  runBillingDeleteRoute,
  runBillingGetRoute,
  runBillingPostRoute,
} from '@/lib/server/routes/billing/runner'

export async function GET() {
  return runBillingGetRoute()
}

export async function POST(req: Request) {
  return runBillingPostRoute(req)
}

export async function DELETE() {
  return runBillingDeleteRoute()
}
