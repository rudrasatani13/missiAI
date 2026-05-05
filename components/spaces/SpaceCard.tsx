'use client'

import Link from 'next/link'
import type { SpaceSummary } from '@/types/spaces'

function relativeTime(ts: number): string {
  if (!ts) return 'recently'
  const diff = Date.now() - ts
  const s = Math.floor(diff / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(ts).toLocaleDateString()
}

export default function SpaceCard({ summary }: { summary: SpaceSummary }) {
  return (
    <Link
      href={`/spaces/${summary.spaceId}`}
      className="block rounded-2xl p-5 no-underline transition-colors"
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
        color: 'var(--missi-text-primary)',
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="text-3xl leading-none">{summary.emoji || '🫂'}</div>
        <span
          className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full"
          style={{
            color:
              summary.userRole === 'owner'
                ? 'rgba(251,191,36,0.85)'
                : 'var(--missi-text-secondary)',
            background:
              summary.userRole === 'owner'
                ? 'rgba(251,191,36,0.08)'
                : 'var(--missi-text-muted)',
            border:
              summary.userRole === 'owner'
                ? '1px solid rgba(251,191,36,0.25)'
                : '1px solid var(--missi-border)',
          }}
        >
          {summary.userRole}
        </span>
      </div>
      <h3 className="text-base font-medium m-0 mb-1">{summary.name}</h3>
      <p className="text-[11px] text-[var(--missi-text-muted)] m-0 mb-3 capitalize">
        {summary.category}
      </p>
      <div className="flex items-center justify-between text-[11px] text-[var(--missi-text-muted)]">
        <span>
          {summary.memberCount} member{summary.memberCount === 1 ? '' : 's'}
        </span>
        <span>{relativeTime(summary.recentActivity)}</span>
      </div>
    </Link>
  )
}
