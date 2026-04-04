import { getRequestContext } from '@cloudflare/next-on-pages'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export const runtime = 'edge'

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  
  if (userId) {
    let needsSetup = false

    try {
      const { env } = getRequestContext()
      const kv = (env as any).MISSI_MEMORY
      if (kv) {
        const raw = await kv.get(`profile:${userId}`)
        if (!raw) {
          needsSetup = true
        }
      }
    } catch {
      // If KV fetch fails, we fail open to prevent locking the user out
    }

    if (needsSetup) {
      redirect('/setup')
    }
  }

  return <>{children}</>
}
