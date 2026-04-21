// ─── Missi Spaces Plan Gate ──────────────────────────────────────────────────
//
// Spaces is a paid feature. Both `plus` and `pro` users may create and join
// Spaces. Free users always receive a 403 with code `PRO_REQUIRED` so the
// client can surface a consistent upgrade prompt.

import type { PlanId } from '@/types/billing'

export function canAccessSpaces(planId: PlanId): boolean {
  return planId === 'plus' || planId === 'pro'
}

export function proRequiredResponse(): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Missi Spaces requires a Pro plan',
      code: 'PRO_REQUIRED',
      upgrade: '/pricing',
    }),
    { status: 403, headers: { 'Content-Type': 'application/json' } },
  )
}
