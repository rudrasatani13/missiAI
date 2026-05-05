'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

interface Props {
  token: string
  signedIn: boolean
  alreadyMember: boolean
  spaceId: string
  spaceName: string
}

const buttonStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 20px',
  borderRadius: '12px',
  fontSize: '14px',
  fontWeight: 500,
  border: '1px solid var(--missi-border)',
  background: 'var(--missi-nav-text-active)',
  color: 'var(--missi-surface)',
  cursor: 'pointer',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'inline-block',
}

const secondaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: 'var(--missi-surface)',
  color: 'var(--missi-text-primary)',
  border: '1px solid var(--missi-border-strong)',
}

export default function JoinActions({
  token,
  signedIn,
  alreadyMember,
  spaceId,
  spaceName,
}: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleJoin() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/v1/spaces/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        router.push(`/spaces/${spaceId}`)
      } else if (data.code === 'PRO_REQUIRED') {
        setError('Missi Spaces requires a Pro plan.')
      } else {
        setError(data.error || 'Failed to join this Space.')
      }
    } catch {
      setError('Failed to join. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!signedIn) {
    const signInHref = `/sign-in?redirect_url=${encodeURIComponent(`/join/${token}`)}`
    return (
      <Link href={signInHref} style={buttonStyle}>
        Sign in to join {spaceName}
      </Link>
    )
  }

  if (alreadyMember) {
    return (
      <Link href={`/spaces/${spaceId}`} style={buttonStyle}>
        You&apos;re already a member — open Space
      </Link>
    )
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <button
        type="button"
        onClick={handleJoin}
        disabled={loading}
        style={{ ...buttonStyle, opacity: loading ? 0.6 : 1 }}
      >
        {loading ? 'Joining…' : `Join ${spaceName}`}
      </button>
      <Link href="/spaces" style={secondaryStyle}>
        Not now
      </Link>
      {error ? (
        <p className="text-xs text-red-400 mt-1 text-center">{error}</p>
      ) : null}
    </div>
  )
}
