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
        let kv = null
        try {
          const { getRequestContext } = await import('@cloudflare/next-on-pages')
          const { env } = getRequestContext()
          kv = (env as any).MISSI_MEMORY
        } catch {
          // Cloudflare context missing (e.g. running 'npm run dev' locally)
        }
        
        if (kv) {
          const raw = await kv.get(`profile:${userId}`)
          if (!raw) {
            needsSetup = true
          }
        } else {
          // Native Edge runtime missing KV, force setup check in prod, but 
          // allow navigation to proceed so local dev isn't bricked.
          if (process.env.NODE_ENV !== 'development') {
            needsSetup = true 
          }
        }
      }
    } catch (e) {
      console.error("[ChatLayout] Error checking setup profile:", e)
      // Only fail closed in production to avoid bricking local dev workflow
      if (process.env.NODE_ENV !== 'development') {
        needsSetup = true
      }
    }

    if (needsSetup) {
      redirect('/setup')
    }
  }

  return <>{children}</>
}
