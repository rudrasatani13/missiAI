import { jsonResponse } from '@/lib/server/api/response'

export async function POST() {
  return jsonResponse(
    {
      success: false,
      error: 'Budget legacy backfill has been removed after the v2 storage cutover',
      code: 'GONE',
    },
    410,
  )
}
