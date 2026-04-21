// Server-only utilities for authentication

import { auth } from "@clerk/nextjs/server"

/**
 * Extracts and returns the verified userId from the Clerk session.
 * Throws AuthenticationError if the request is unauthenticated.
 *
 * NEVER accept userId from the client request body or query params —
 * always call this function and use the returned value.
 */
export async function getVerifiedUserId(): Promise<string> {
  const { userId } = await auth()
  if (!userId) throw new AuthenticationError()
  return userId
}

export class AuthenticationError extends Error {
  readonly status = 401

  constructor() {
    super("Unauthorized")
    this.name = "AuthenticationError"
  }
}

/** Convenience: return the standard 401 JSON Response for route handlers. */
export function unauthorizedResponse(): Response {
  return new Response(
    JSON.stringify({ success: false, error: "Unauthorized", code: "UNAUTHORIZED" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  )
}
