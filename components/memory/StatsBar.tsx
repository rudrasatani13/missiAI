'use client'

import type { LifeNode, MemoryCategory } from '@/types/memory'

interface Stats {
  totalNodes: number
  totalInteractions: number
  mostAccessedNode: LifeNode | null
  newestNode: LifeNode | null
  topCategory: MemoryCategory | null
}

interface StatsBarProps {
  stats: Stats
}

export function StatsBar({ stats }: StatsBarProps) {
  const topCat = stats.topCategory
    ? stats.topCategory.charAt(0).toUpperCase() + stats.topCategory.slice(1)
    : 'None yet'

  const mostAccessedTitle = stats.mostAccessedNode?.title
    ? stats.mostAccessedNode.title.length > 20
      ? stats.mostAccessedNode.title.slice(0, 20) + '…'
      : stats.mostAccessedNode.title
    : '—'

  const items = [
    { label: 'Total Memories', value: String(stats.totalNodes) },
    { label: 'Conversations', value: String(stats.totalInteractions) },
    { label: 'Top Category', value: topCat },
    { label: 'Most Accessed', value: mostAccessedTitle },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {items.map(({ label, value }) => (
        <div
          key={label}
          className="glass-card glass-noise"
          style={{
            padding: '16px',
            borderRadius: '16px',
          }}
        >
          <p
            style={{
              fontSize: '10px',
              color: 'rgba(255,255,255,0.35)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              margin: 0,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: '20px',
              color: 'rgba(255,255,255,0.85)',
              fontWeight: 500,
              margin: '6px 0 0 0',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {value}
          </p>
        </div>
      ))}
    </div>
  )
}
