'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useUser } from '@clerk/nextjs'
import { Users } from 'lucide-react'
import { ChatShell } from '@/components/shell/ChatShell'
import SpacesDashboard from '@/components/spaces/SpacesDashboard'

export default function SpacesPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()
  const [plan, setPlan] = useState<string | null>(null)
  const [checkingPlan, setCheckingPlan] = useState(true)

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push('/sign-in')
  }, [isLoaded, isSignedIn, router])

  useEffect(() => {
    if (!isSignedIn) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/v1/billing')
        const data = await res.json()
        if (!cancelled) setPlan((data?.plan?.id as string) ?? 'free')
      } catch {
        if (!cancelled) setPlan('free')
      } finally {
        if (!cancelled) setCheckingPlan(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isSignedIn])

  const canAccess = plan === 'plus' || plan === 'pro'

  return (
    <ChatShell>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          background:
            'radial-gradient(500px circle at 25% 18%, rgba(59,130,246,0.06), transparent 60%), radial-gradient(420px circle at 80% 85%, rgba(139,92,246,0.05), transparent 65%)',
          filter: 'blur(100px)',
        }}
      />
      <div
        className="relative z-10 max-w-[960px] mx-auto px-4 md:px-6 pb-6 md:py-8"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2.5 mb-6">
          <Users className="w-5 h-5" style={{ color: 'var(--missi-text-muted)' }} />
          <h1
            className="text-base md:text-lg font-medium m-0"
            style={{ color: 'var(--missi-text-primary)' }}
          >
            Missi Spaces
          </h1>
        </div>

        {!isLoaded || checkingPlan ? (
          <p className="text-sm text-[var(--missi-text-muted)]">Loading…</p>
        ) : !canAccess ? (
          <UpgradePrompt />
        ) : (
          <SpacesDashboard />
        )}
      </div>
    </ChatShell>
  )
}

function UpgradePrompt() {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: 'var(--missi-surface)',
        backdropFilter: 'blur(24px) saturate(140%)',
        border: '1px solid var(--missi-border)',
      }}
    >
      <div className="text-4xl mb-4">🫂</div>
      <h2 className="text-lg font-medium text-[var(--missi-text-primary)] mb-2">
        Share memory with the people closest to you
      </h2>
      <p className="text-sm text-[var(--missi-text-secondary)] mb-6 max-w-md mx-auto">
        Missi Spaces lets you share AI memory with a partner, family, or study
        group. It&apos;s available on the Plus and Pro plans.
      </p>
      <Link
        href="/pricing"
        className="inline-flex px-5 py-2 rounded-full text-xs font-medium no-underline"
        style={{
          border: '1px solid var(--missi-border)',
          background: 'var(--missi-nav-text-active)',
          color: 'var(--missi-bg)',
        }}
      >
        Upgrade to Plus
      </Link>
    </div>
  )
}
