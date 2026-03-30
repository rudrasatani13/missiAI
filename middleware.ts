import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/sign-up(.*)",
  "/waitlist(.*)",
  "/manifesto(.*)",
])

// API routes handle their own auth and return JSON 401 — not a browser redirect.
// Letting middleware's auth.protect() run on API routes causes Clerk to do a
// page-style redirect, which returns HTML instead of a proper JSON error response.
const isAPIRoute = createRouteMatcher(["/api/(.*)"])

export default clerkMiddleware(async (auth, request) => {
  if (isAPIRoute(request)) return  // route handlers call auth() themselves
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}