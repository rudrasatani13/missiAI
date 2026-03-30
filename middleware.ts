import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"
import { NextResponse } from "next/server"
import type { NextRequest, NextFetchEvent } from "next/server"

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/sign-up(.*)",
  "/waitlist(.*)",
  "/manifesto(.*)",
])

// API routes handle their own Clerk auth and return JSON 401 — not a browser
// redirect. Letting middleware's auth.protect() run here causes Clerk to issue a
// page-style redirect, which sends HTML instead of a JSON error.
const isAPIRoute = createRouteMatcher(["/api/(.*)"])

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
const IP_LIMIT = 10
const IP_WINDOW_MS = 60_000 // 60 seconds

function checkIPRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const entry = ipMap.get(ip)

  if (!entry || now >= entry.resetAt) {
    ipMap.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS })
    return { allowed: true, retryAfter: 0 }
  }

  if (entry.count >= IP_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { allowed: true, retryAfter: 0 }
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
  if (isAPIRoute(request)) {
    const ip = getClientIP(request)
    const { allowed, retryAfter } = checkIPRateLimit(ip)

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ success: false, error: "Too many requests. Please slow down." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
          },
        }
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
  try {
    return await clerkHandler(request, event)
  } catch (error) {
    console.error("[Middleware] Clerk error on", request.nextUrl.pathname, ":", error)

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

    // Protected page routes redirect to login
    return NextResponse.redirect(new URL("/login", request.url))
  }
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}
