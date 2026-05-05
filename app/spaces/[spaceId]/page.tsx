'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { ChatShell } from '@/components/shell/ChatShell'
import SpaceDetailView from '@/components/spaces/SpaceDetailView'
import type { SpaceMember, SpaceMetadata, SpaceRole } from '@/types/spaces'

interface DetailData {
  space: SpaceMetadata
  members: SpaceMember[]
  userRole: SpaceRole
}

export default function SpaceDetailPage() {
  const params = useParams<{ spaceId: string }>()
  const spaceId = params.spaceId
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  const [data, setData] = useState<DetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && !isSignedIn) router.push('/sign-in')
  }, [isLoaded, isSignedIn, router])

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/v1/spaces/${spaceId}`)
      const j = await res.json()
      if (res.status === 403) {
        router.replace('/spaces')
        return
      }
      if (res.ok && j.success) {
        setData(j.data as DetailData)
      } else {
        setError(j.error || 'Failed to load Space')
      }
    } catch {
      setError('Failed to load Space')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isSignedIn && spaceId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, spaceId])

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
        <Link
          href="/spaces"
          className="inline-flex items-center gap-1 text-xs text-[var(--missi-text-secondary)] no-underline mb-4"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> All Spaces
        </Link>

        {loading ? (
          <p className="text-sm text-[var(--missi-text-muted)]">Loading…</p>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : data ? (
          <SpaceDetailView data={data} onReload={load} />
        ) : null}
      </div>
    </ChatShell>
  )
}
