import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

// Yahan se AI routes hata diye gaye hain taaki wo secure rahein
const isPublicRoute = createRouteMatcher([
  "/",
  "/login(.*)",
  "/sign-up(.*)",
  "/waitlist(.*)",
  "/manifesto(.*)",
])

export default clerkMiddleware(async (auth, request) => {
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