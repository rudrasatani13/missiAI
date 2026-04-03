import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { NextRequest, NextFetchEvent } from "next/server"
import { log } from "@/lib/server/logger"

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/waitlist(.*)",
  "/manifesto(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/api/webhooks/stripe",
  "/pricing(.*)",
])

// Admin routes require Clerk auth (admin check happens server-side in API route)
const isAdminRoute = createRouteMatcher(["/admin(.*)"])

// API routes handle their own Clerk auth and return JSON 401 — not a browser
// redirect. Letting middleware's auth.protect() run here causes Clerk to issue a
// page-style redirect, which sends HTML instead of a JSON error.
const isAPIRoute = createRouteMatcher(["/api/(.*)", "/api/v1/(.*)"])

// Health endpoint is public — applies a separate, lower IP rate limit
const isHealthRoute = createRouteMatcher(["/api/health"])

// ─── Security response headers (OWASP A05: Security Misconfiguration) ────────
//
// Applied to every API response so clients cannot interpret responses as
// something other than JSON, and cannot be framed or sniffed.

const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME-type sniffing — browser must honour Content-Type
  "X-Content-Type-Options": "nosniff",
  // Disallow embedding in iframes — prevents clickjacking
  "X-Frame-Options": "DENY",
  // Modern replacement for X-Frame-Options; also blocks all framing origins
  "Content-Security-Policy": "frame-ancestors 'none'",
  // Emit only the origin, never the full referrer URL, on cross-origin requests
  "Referrer-Policy": "strict-origin-when-cross-origin",
}

function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

// ─── IP-based rate limiter (Map, Edge-runtime compatible) ─────────────────────
//
// Each Cloudflare Worker isolate has its own memory, so this Map is per-isolate
// rather than globally distributed. It acts as a per-instance burst guard that
// complements the KV-backed per-user limit enforced inside each route handler.

interface IPEntry {
  count: number
  resetAt: number // ms timestamp
}

const ipMap = new Map<string, IPEntry>()
// Standard API endpoints: 60 req/min — voice assistant makes 3-4 calls per interaction
const IP_LIMIT = 60
const IP_WINDOW_MS = 60_000 // 60 seconds

// Health endpoint: lower burst limit — unauthenticated public probe
const HEALTH_IP_LIMIT = 20
const healthIpMap = new Map<string, IPEntry>()

function checkIPRateLimitInternal(
  map: Map<string, IPEntry>,
  ip: string,
  limit: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = map.get(ip)

  if (!entry || now >= entry.resetAt) {
    map.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS })
    return { allowed: true, retryAfter: 0 }
  }

  if (entry.count >= limit) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { allowed: true, retryAfter: 0 }
}

function checkIPRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  return checkIPRateLimitInternal(ipMap, ip, IP_LIMIT)
}

function checkHealthIPRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  return checkIPRateLimitInternal(healthIpMap, ip, HEALTH_IP_LIMIT)
}

function getClientIP(request: Request): string {
  // Cloudflare sets cf-connecting-ip; x-forwarded-for is a fallback for other hosts.
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  )
}

// ─── Clerk handler ───────────────────────────────────────────────────────────

const clerkHandler = clerkMiddleware(async (auth, request) => {
  const startTime = Date.now()

  if (isAPIRoute(request)) {
    const ip = getClientIP(request)

    // Health endpoint: apply its own (lower) IP rate limit, then pass through
    if (isHealthRoute(request)) {
      const { allowed, retryAfter } = checkHealthIPRateLimit(ip)
      if (!allowed) {
        return applySecurityHeaders(
          new NextResponse(
            JSON.stringify({ success: false, error: "Too many requests." }),
            {
              status: 429,
              headers: {
                "Content-Type": "application/json",
                "Retry-After": String(retryAfter),
              },
            },
          ),
        )
      }
      return
    }

    const { allowed, retryAfter } = checkIPRateLimit(ip)

    if (!allowed) {
      log({
        level: "warn",
        event: "api.rate_limited",
        metadata: { ip, path: request.nextUrl.pathname },
        timestamp: Date.now(),
      })

      return applySecurityHeaders(
        new NextResponse(
          JSON.stringify({ success: false, error: "Too many requests. Please slow down." }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(retryAfter),
            },
          },
        ),
      )
    }

    // Route handlers call auth() themselves — do not redirect here.
    return
  }

  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

// ─── Middleware wrapper with error resilience ─────────────────────────────────
//
// On Cloudflare edge runtime, clerkMiddleware can crash if CLERK_SECRET_KEY is
// missing or if there's a runtime incompatibility. This wrapper catches those
// errors so public routes (login, sign-up, landing, etc.) still render instead
// of returning a 500 Internal Server Error.

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const startTime = Date.now()

  try {
    const rawResponse = await clerkHandler(request, event)

    // Attach security headers to every API response that passes through middleware.
    // Route handlers that return their own NextResponse will have these headers set
    // here; plain `undefined` (pass-through) is left for Next.js to handle.
    const response =
      rawResponse instanceof NextResponse && isAPIRoute(request)
        ? applySecurityHeaders(rawResponse)
        : rawResponse

    // Log completed API requests
    if (isAPIRoute(request)) {
      const status = response?.status ?? 200
      const userId = request.headers.get("x-clerk-user-id") ?? undefined

      if (status === 401) {
        log({
          level: "warn",
          event: "api.unauthorized",
          metadata: { path: request.nextUrl.pathname },
          timestamp: Date.now(),
        })
      }

      log({
        level: "info",
        event: "api.request",
        userId,
        durationMs: Date.now() - startTime,
        metadata: {
          path: request.nextUrl.pathname,
          method: request.method,
          status,
        },
        timestamp: Date.now(),
      })
    }

    return response
  } catch (error) {
    console.error("[Middleware] Clerk error on", request.nextUrl.pathname, ":", error)

    log({
      level: "error",
      event: "middleware.error",
      metadata: {
        path: request.nextUrl.pathname,
        error: error instanceof Error ? error.message : String(error),
      },
      timestamp: Date.now(),
    })

    // Public routes should still render even if Clerk fails
    if (isPublicRoute(request)) {
      return NextResponse.next()
    }

    // API routes get a JSON error instead of a crash
    if (isAPIRoute(request)) {
      return new NextResponse(
        JSON.stringify({ success: false, error: "Authentication service unavailable" }),
        { status: 503, headers: { "Content-Type": "application/json" } }
      )
    }

    // Protected page routes redirect to sign-in
    return NextResponse.redirect(new URL("/sign-in", request.url))
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
