import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { NextRequest, NextFetchEvent } from "next/server"
import { log, logAuthEvent, logSecurityEvent } from "@/lib/server/logger"

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/manifesto(.*)",
  "/privacy(.*)",
  "/terms(.*)",
  "/api/webhooks/dodo",
  "/pricing(.*)",
])

// Auth page routes — rate-limited separately with a tighter per-IP cap to
// slow credential-stuffing bots and mass sign-up automation.
const isAuthRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"])

// Admin routes require Clerk auth and admin role check
const isAdminRoute = createRouteMatcher(["/admin(.*)", "/api/v1/admin(.*)"])

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

// ─── CORS Configuration ───────────────────────────────────────────────────────
//
// Explicit allowed origins. No wildcards are permitted per security requirements.
const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL || "https://missi.space",
  // Only allow localhost in development — never in production deployments
  ...(process.env.NODE_ENV !== "production" ? ["http://localhost:3000"] : []),
]

function applyCorsHeaders(response: NextResponse, request: NextRequest | Request): NextResponse {
  const origin = request.headers.get("origin") ?? ""
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set("Access-Control-Allow-Origin", origin)
    response.headers.set("Access-Control-Allow-Credentials", "true")
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-clerk-user-id")
  }
  
  return response
}

// ─── IP-based rate limiter (sliding window, Edge-runtime compatible) ──────────
//
// Each Cloudflare Worker isolate has its own memory, so these Maps are
// per-isolate rather than globally distributed.  They act as a per-instance
// burst guard that complements the KV-backed per-user limit enforced inside
// each route handler.
//
// Sliding-window (two-bucket approximation):
//   effective = prev_count × overlap_fraction + current_count
// This smooths out the fixed-window burst vulnerability where a client could
// send 2× the limit across a window boundary.

interface IPBucket {
  count: number
  windowStart: number // ms timestamp of current window start
}

// ── Violation tracker for escalating penalties ───────────────────────────────
// After 3 consecutive rate-limit violations within a tracking period, the
// retry-after is doubled.  This makes automated scripts progressively slower
// without affecting real users who hit the limit once.

interface ViolationEntry {
  violations: number
  firstViolationAt: number
}

const violationMap = new Map<string, ViolationEntry>()
const VIOLATION_WINDOW_MS  = 10 * 60_000 // 10 min tracking window
const VIOLATION_ESCALATION = 3           // violations before doubling retry-after

// ── IP bucket maps ───────────────────────────────────────────────────────────

const ipMap = new Map<string, IPBucket>()
const prevIpMap = new Map<string, IPBucket>()

// Standard API endpoints: 100 req/min (matches per-user KV limit)
const IP_LIMIT     = 100
const IP_WINDOW_MS = 60_000

// Health endpoint: lower burst limit — unauthenticated public probe
const HEALTH_IP_LIMIT = 20
const healthIpMap = new Map<string, IPBucket>()
const prevHealthIpMap = new Map<string, IPBucket>()

// Auth pages (/sign-in, /sign-up): 15 req / 15 min — deters credential
// stuffing and mass sign-up bots
const AUTH_IP_LIMIT  = 15
const AUTH_WINDOW_MS = 15 * 60_000
const authIpMap = new Map<string, IPBucket>()
const prevAuthIpMap = new Map<string, IPBucket>()

// ── Known bot User-Agent patterns ────────────────────────────────────────────
// These default UA strings are almost never set by real browsers.  Requests
// matching them get a halved rate limit on non-health endpoints.
const BOT_UA_PATTERNS = [
  /^python-requests\//i,
  /^python-urllib\//i,
  /^curl\//i,
  /^wget\//i,
  /^node-fetch\//i,
  /^axios\//i,
  /^go-http-client\//i,
  /^okhttp\//i,
  /^java\//i,
  /^libwww-perl\//i,
  /scrapy/i,
  /bot/i,
  /spider/i,
  /crawl/i,
]

function isSuspiciousUA(ua: string | null): boolean {
  if (!ua || ua.trim().length === 0) return true
  return BOT_UA_PATTERNS.some((p) => p.test(ua))
}

// ── Sliding-window check ─────────────────────────────────────────────────────

function checkIPRateLimitInternal(
  currentMap: Map<string, IPBucket>,
  prevMap: Map<string, IPBucket>,
  ip: string,
  limit: number,
  windowMs: number = IP_WINDOW_MS,
): { allowed: boolean; retryAfter: number; remaining: number; limit: number; resetAt: number } {
  const now = Date.now()

  // ── Current bucket ──────────────────────────────────────────────────────
  let current = currentMap.get(ip)
  if (!current || now >= current.windowStart + windowMs) {
    // Rotate: current → prev, start fresh
    if (current) prevMap.set(ip, current)
    current = { count: 0, windowStart: now }
    currentMap.set(ip, current)
  }

  // ── Previous bucket weight ──────────────────────────────────────────────
  const prev = prevMap.get(ip)
  let prevWeight = 0
  let prevCount = 0
  if (prev && now < prev.windowStart + 2 * windowMs) {
    const elapsed = now - current.windowStart
    prevWeight = Math.max(0, (windowMs - elapsed) / windowMs)
    prevCount = prev.count
  }

  const effectiveCount = prevCount * prevWeight + current.count
  const resetAt = current.windowStart + windowMs
  const retryAfterBase = Math.max(1, Math.ceil((resetAt - now) / 1000))

  if (effectiveCount >= limit) {
    // ── Escalation check ────────────────────────────────────────────────
    let retryAfter = retryAfterBase
    const v = violationMap.get(ip)
    if (v && now - v.firstViolationAt < VIOLATION_WINDOW_MS) {
      v.violations++
      if (v.violations >= VIOLATION_ESCALATION) {
        retryAfter = retryAfter * 2 // double penalty
      }
    } else {
      violationMap.set(ip, { violations: 1, firstViolationAt: now })
    }

    return { allowed: false, retryAfter, remaining: 0, limit, resetAt: Math.floor(resetAt / 1000) }
  }

  current.count++
  const remaining = Math.max(0, Math.floor(limit - effectiveCount - 1))
  return { allowed: true, retryAfter: 0, remaining, limit, resetAt: Math.floor(resetAt / 1000) }
}

function checkIPRateLimit(
  ip: string,
  limitOverride?: number,
): { allowed: boolean; retryAfter: number; remaining: number; limit: number; resetAt: number } {
  return checkIPRateLimitInternal(ipMap, prevIpMap, ip, limitOverride ?? IP_LIMIT)
}

function checkHealthIPRateLimit(ip: string) {
  return checkIPRateLimitInternal(healthIpMap, prevHealthIpMap, ip, HEALTH_IP_LIMIT)
}

function checkAuthIPRateLimit(ip: string) {
  return checkIPRateLimitInternal(authIpMap, prevAuthIpMap, ip, AUTH_IP_LIMIT, AUTH_WINDOW_MS)
}

function getClientIP(request: Request): string {
  // Cloudflare sets cf-connecting-ip; x-forwarded-for is a fallback for other hosts.
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "unknown"
  )
}

// ── Rate-limit 429 response helper ───────────────────────────────────────────

function rateLimited429(
  result: { retryAfter: number; remaining: number; limit: number; resetAt: number },
  message = "Too many requests. Please slow down.",
): NextResponse {
  return applySecurityHeaders(
    new NextResponse(
      JSON.stringify({ success: false, error: message }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfter),
          "X-RateLimit-Limit": String(result.limit),
          "X-RateLimit-Remaining": String(result.remaining),
          "X-RateLimit-Reset": String(result.resetAt),
        },
      },
    ),
  )
}

// ─── Clerk handler ───────────────────────────────────────────────────────────

const clerkHandler = clerkMiddleware(
  async (auth, request) => {
  const startTime = Date.now()

  if (isAPIRoute(request)) {
    const ip = getClientIP(request)

    // Health endpoint: apply its own (lower) IP rate limit, then pass through
    if (isHealthRoute(request)) {
      const result = checkHealthIPRateLimit(ip)
      if (!result.allowed) {
        return rateLimited429(result, "Too many requests.")
      }
      return
    }

    // Bot fingerprinting: suspicious or missing User-Agent gets a halved rate
    // limit.  This doesn't outright block — legitimate API clients can still
    // work, but automated scripts hit the wall much faster.
    const ua = request.headers.get("user-agent")
    const suspicious = isSuspiciousUA(ua)
    const effectiveLimit = suspicious ? Math.floor(IP_LIMIT / 2) : undefined
    const result = checkIPRateLimit(ip, effectiveLimit)

    if (suspicious) {
      logSecurityEvent("security.bot_ua_detected", {
        ip,
        userAgent: ua ?? undefined,
        path: request.nextUrl.pathname,
        metadata: { effectiveLimit: effectiveLimit ?? IP_LIMIT },
      })
    }

    if (!result.allowed) {
      logSecurityEvent("security.rate_limit_exceeded", {
        ip,
        userAgent: ua ?? undefined,
        path: request.nextUrl.pathname,
        metadata: {
          suspiciousUA: suspicious,
          violations: violationMap.get(ip)?.violations ?? 1,
        },
      })

      return rateLimited429(result)
    }

    if (isAdminRoute(request)) {
      const authObj = await auth()
      const rawRole = (authObj.sessionClaims?.metadata as any)?.role
      const role = typeof rawRole === 'string' ? rawRole : undefined
      const isRoleAdmin = role === "admin"
      const isSuperAdminEnv = process.env.ADMIN_USER_ID ? authObj.userId === process.env.ADMIN_USER_ID : false

      if (!isRoleAdmin && !isSuperAdminEnv) {
        return applySecurityHeaders(
          new NextResponse(
            JSON.stringify({ error: "Forbidden: Admin access required" }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )
        )
      }

      // Check for session freshness (require separate login confirmation for sensitive actions)
      // Clerk JWT includes `iat` (issued at) or `auth_time`. If the token's original auth
      // is too old, or we want to force re-evaluation, we can enforce it here.
      // For now, we enforce that the admin has the role check passing. 
      // If a specific sensitive action requires step-up auth, those API routes
      // can manually trigger a re-auth challenge by returning 401 with a specific error code.
    }

    // Route handlers call auth() themselves — do not redirect here.
    return
  }

  // Auth pages: tighter IP rate limit to deter credential-stuffing and mass sign-up
  if (isAuthRoute(request)) {
    const ip = getClientIP(request)
    const result = checkAuthIPRateLimit(ip)
    if (!result.allowed) {
      log({
        level: "warn",
        event: "auth.rate_limited",
        metadata: { ip, path: request.nextUrl.pathname },
        timestamp: Date.now(),
      })
      // Return a simple page-level response for browsers
      return new NextResponse(
        `<html><body><h1>Too Many Requests</h1><p>Please wait ${result.retryAfter} seconds before trying again.</p></body></html>`,
        {
          status: 429,
          headers: {
            "Content-Type": "text/html",
            "Retry-After": String(result.retryAfter),
            "X-RateLimit-Limit": String(result.limit),
            "X-RateLimit-Remaining": String(result.remaining),
            "X-RateLimit-Reset": String(result.resetAt),
          },
        },
      )
    }
  }

  if (!isPublicRoute(request)) {
    await auth.protect()

    if (isAdminRoute(request)) {
      const authObj = await auth()
      const rawPageRole = (authObj.sessionClaims?.metadata as any)?.role
      const role = typeof rawPageRole === 'string' ? rawPageRole : undefined
      const isRoleAdmin = role === "admin"
      const adminEnv = process.env.ADMIN_USER_ID
      const isSuperAdminEnv = adminEnv ? authObj.userId === adminEnv : false

      log({
        level: "debug",
        event: "admin.access_check",
        userId: authObj.userId ?? undefined,
        metadata: { role, isRoleAdmin, isSuperAdminEnv, path: request.nextUrl.pathname },
        timestamp: Date.now(),
      })

      if (!isRoleAdmin && !isSuperAdminEnv) {
        const signInUrl = new URL("/sign-in", request.url)
        signInUrl.searchParams.set("redirect_url", request.nextUrl.pathname)
        return NextResponse.redirect(signInUrl)
      }
    }
  }
  },
  {
    // Explicitly declare sign-in/sign-up URLs so auth.protect() redirects
    // to the correct path and never falls back to an unexpected default.
    signInUrl: "/sign-in",
    signUpUrl: "/sign-up",
  },
)

// ─── Middleware wrapper with error resilience ─────────────────────────────────
//
// On Cloudflare edge runtime, clerkMiddleware can crash if CLERK_SECRET_KEY is
// missing or if there's a runtime incompatibility. This wrapper catches those
// errors so public routes (login, sign-up, landing, etc.) still render instead
// of returning a 500 Internal Server Error.

export default async function middleware(request: NextRequest, event: NextFetchEvent) {
  const startTime = Date.now()
  // Resolve client IP once so it can appear in all log events within this request
  const clientIp = getClientIP(request)

  // ── CORS Preflight Intercept ──
  if (request.method === "OPTIONS" && isAPIRoute(request)) {
    let response = new NextResponse(null, { status: 204 })
    response = applySecurityHeaders(response)
    response = applyCorsHeaders(response, request)
    return response
  }

  try {
    const rawResponse = await clerkHandler(request, event)

    // Attach security and CORS headers to every API response that passes through middleware.
    // If Clerk didn't return a NextResponse, we create one so we can attach headers before continuing.
    let response = rawResponse instanceof NextResponse ? rawResponse : NextResponse.next()

    if (isAPIRoute(request)) {
      response = applySecurityHeaders(response)
      response = applyCorsHeaders(response, request)
    }

    // Log completed API requests
    if (isAPIRoute(request)) {
      const status = response?.status ?? 200
      const userId = request.headers.get("x-clerk-user-id") ?? undefined
      const ua = request.headers.get("user-agent") ?? undefined

      if (status === 401) {
        logAuthEvent("auth.unauthorized", {
          ip: clientIp,
          userAgent: ua,
          path: request.nextUrl.pathname,
          outcome: "failure",
          reason: "unauthenticated_api_request",
        })
      }

      log({
        level: "info",
        event: "api.request",
        userId,
        ip: clientIp,
        userAgent: ua ? ua.slice(0, 200) : undefined,
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
    // Next.js redirect() throws a special error with digest "NEXT_REDIRECT".
    // Re-throw it so the framework handles the redirect correctly instead of
    // the catch block swallowing it and issuing a plain /sign-in redirect.
    if (
      error != null &&
      typeof (error as Record<string, unknown>).digest === "string" &&
      ((error as Record<string, unknown>).digest as string).startsWith("NEXT_REDIRECT")
    ) {
      throw error
    }

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

    // Loop-detection: if the request is already coming from the sign-in page
    // (e.g. the user just authenticated but the session still can't be verified),
    // stop redirecting and return a 503 instead.  This breaks the infinite
    // /sign-in → /chat → /sign-in cycle that occurs when Clerk env vars are
    // missing or misconfigured in the edge runtime.
    const referer = request.headers.get("referer") ?? ""
    const signInOrigin = new URL("/sign-in", request.url).href
    if (referer.startsWith(signInOrigin)) {
      return new NextResponse(
        JSON.stringify({ success: false, error: "Authentication service unavailable. Please check your configuration." }),
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
