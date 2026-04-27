import { NextRequest } from 'next/server'
import { runSetupPostRoute } from '@/lib/server/routes/setup/runner'

export async function POST(req: NextRequest) {
  return runSetupPostRoute(req)
}
