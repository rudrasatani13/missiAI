import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  
  if (userId) {
    let needsSetup = false

    try {
      // Primary check: Clerk publicMetadata (reliable everywhere)
      const { clerkClient } = await import('@clerk/nextjs/server')
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      
      if (user.publicMetadata?.setupComplete) {
        needsSetup = false
      } else {
        // Fallback or secondary check if Clerk metadata isn't updated
        const { getRequestContext } = await import('@cloudflare/next-on-pages')
        const { env } = getRequestContext()
        const kv = (env as any).MISSI_MEMORY
        if (kv) {
          const raw = await kv.get(`profile:${userId}`)
          if (!raw) {
            needsSetup = true
          }
        } else {
          needsSetup = true // Native Edge runtime missing KV, force setup check
        }
      }
    } catch (e) {
      console.error("[ChatLayout] Error checking setup profile:", e)
      needsSetup = true // Fail closed for setup to ensure users do onboarding!
    }

    if (needsSetup) {
      redirect('/setup')
    }
  }

  return <>{children}</>
}
