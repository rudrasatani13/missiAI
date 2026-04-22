'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { ChatShell } from '@/components/shell/ChatShell'
import BudgetBuddyDashboard from '@/components/budget/BudgetBuddyDashboard'

export default function BudgetPage() {
  const { isLoaded, isSignedIn } = useUser()
  const router = useRouter()

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  if (!isLoaded || !isSignedIn) return null

  return (
    <ChatShell>
      <div
        className="relative min-h-full flex flex-col items-center justify-start px-4 py-5 md:px-6 md:py-8 lg:px-8"
        style={{ fontFamily: 'var(--font-body)' }}
      >
        {/* Ambient field */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            background:
              'radial-gradient(620px circle at 16% 12%, rgba(34,197,94,0.10), transparent 54%), radial-gradient(520px circle at 82% 16%, rgba(234,179,8,0.08), transparent 58%), radial-gradient(460px circle at 72% 86%, rgba(34,197,94,0.06), transparent 60%)',
            filter: 'blur(140px)',
          }}
        />
        <div className="w-full max-w-5xl relative z-10">
          <BudgetBuddyDashboard />
        </div>
      </div>
    </ChatShell>
  )
}
