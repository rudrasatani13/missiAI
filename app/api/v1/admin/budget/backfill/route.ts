function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

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
