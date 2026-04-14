/**
 * Memory layout — authentication is handled by the Clerk middleware
 * (middleware.ts → auth.protect() for all non-public routes).
 *
 * This layout is intentionally kept as a simple pass-through to avoid
 * requiring `runtime = 'edge'`, which would bundle all child page
 * client-side dependencies (three.js, framer-motion, etc.) into
 * separate edge function bundles, blowing past the 25 MB Cloudflare limit.
 */
export default function MemoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
