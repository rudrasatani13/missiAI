function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

export async function POST() {
  return jsonResponse(
    {
      success: false,
      error: 'Life Graph legacy backfill has been removed after the v2 storage cutover',
      code: 'GONE',
    },
    410,
  )
}
