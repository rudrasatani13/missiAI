'use client'

import { useState } from 'react'
import { 
  ChevronDown, Trash2, Users, Target, Repeat, Star, 
  Calendar, MessageSquare, Zap, MapPin, FileText 
} from 'lucide-react'
import type { LifeNode, MemoryCategory } from '@/types/memory'

/* ── Category grouping map ──────────────────────────────────────────────────── */

interface CategoryGroup {
  label: string
  icon: React.ElementType
  categories: MemoryCategory[]
}

const GROUPS: CategoryGroup[] = [
  { label: 'People & Relationships', icon: Users, categories: ['person', 'relationship'] },
  { label: 'Goals & Ambitions',      icon: Target, categories: ['goal'] },
  { label: 'Habits & Routines',      icon: Repeat, categories: ['habit'] },
  { label: 'Preferences & Tastes',   icon: Star, categories: ['preference'] },
  { label: 'Life Events',            icon: Calendar, categories: ['event'] },
  { label: 'Emotions & Feelings',    icon: MessageSquare, categories: ['emotion', 'belief'] },
  { label: 'Skills & Knowledge',     icon: Zap, categories: ['skill'] },
  { label: 'Places',                 icon: MapPin, categories: ['place'] },
]

function groupNodes(nodes: LifeNode[]): { group: CategoryGroup; nodes: LifeNode[] }[] {
  const result: { group: CategoryGroup; nodes: LifeNode[] }[] = []

  for (const group of GROUPS) {
    const matched = nodes.filter((n) => group.categories.includes(n.category))
    if (matched.length > 0) {
      // Sort by most recent first
      matched.sort((a, b) => b.updatedAt - a.updatedAt)
      result.push({ group, nodes: matched })
    }
  }

  // Catch any uncategorized nodes
  const allGroupedCategories = GROUPS.flatMap((g) => g.categories)
  const ungrouped = nodes.filter((n) => !allGroupedCategories.includes(n.category))
  if (ungrouped.length > 0) {
    result.push({
      group: { label: 'Other', icon: FileText, categories: [] },
      nodes: ungrouped,
    })
  }

  return result
}

/* ── Memory Item Row ────────────────────────────────────────────────────────── */

function MemoryRow({
  node,
  onDelete,
  isDeleting,
}: {
  node: LifeNode
  onDelete: (id: string) => void
  isDeleting: boolean
}) {
  const [confirming, setConfirming] = useState(false)

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDeleting) return
    if (confirming) {
      setConfirming(false)
      onDelete(node.id)
    } else {
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '12px',
        padding: '12px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        opacity: isDeleting ? 0.4 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Dot indicator */}
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: node.confidence > 0.7
            ? 'rgba(255,255,255,0.6)'
            : node.confidence >= 0.4
              ? 'rgba(255,255,255,0.3)'
              : 'rgba(255,255,255,0.12)',
          marginTop: 6,
          flexShrink: 0,
        }}
      />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'rgba(255,255,255,0.85)',
            fontWeight: 500,
            lineHeight: '1.4',
          }}
        >
          {node.title}
        </p>
        {node.detail && (
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '12px',
              color: 'rgba(255,255,255,0.4)',
              lineHeight: '1.4',
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {node.detail}
          </p>
        )}
      </div>

      {/* Delete */}
      <button
        onClick={handleDelete}
        title={confirming ? 'Click again to confirm' : 'Delete'}
        style={{
          background: 'none',
          border: confirming ? '1px solid rgba(239,68,68,0.4)' : 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          color: confirming ? '#ef4444' : 'rgba(255,255,255,0.2)',
          padding: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          flexShrink: 0,
          fontSize: '10px',
          transition: 'color 0.15s',
        }}
      >
        <Trash2 style={{ width: 13, height: 13 }} />
        {confirming && <span>Sure?</span>}
      </button>
    </div>
  )
}

/* ── Category Group Section ─────────────────────────────────────────────────── */

function GroupSection({
  group,
  nodes,
  onDelete,
  deletingId,
  defaultOpen,
}: {
  group: CategoryGroup
  nodes: LifeNode[]
  onDelete: (id: string) => void
  deletingId: string | null
  defaultOpen: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '14px',
        overflow: 'hidden',
        transition: 'border-color 0.2s',
      }}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '14px 16px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.85)',
          textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px' }}>
          <group.icon size={18} strokeWidth={1.5} />
        </span>
        <span
          style={{
            flex: 1,
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: '0.01em',
          }}
        >
          {group.label}
        </span>
        <span
          style={{
            fontSize: '11px',
            color: 'rgba(255,255,255,0.35)',
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '999px',
            padding: '2px 8px',
            fontWeight: 500,
          }}
        >
          {nodes.length}
        </span>
        <ChevronDown
          style={{
            width: 16,
            height: 16,
            color: 'rgba(255,255,255,0.3)',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.25s ease',
          }}
        />
      </button>

      {/* Expandable content */}
      <div
        style={{
          maxHeight: isOpen ? `${nodes.length * 100 + 20}px` : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s ease',
        }}
      >
        <div style={{ padding: '0 16px 12px' }}>
          {nodes.map((node) => (
            <MemoryRow
              key={node.id}
              node={node}
              onDelete={onDelete}
              isDeleting={deletingId === node.id}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Main Grouped View ──────────────────────────────────────────────────────── */

interface GroupedMemoryViewProps {
  nodes: LifeNode[]
  onDelete: (id: string) => void
  deletingId: string | null
}

export function GroupedMemoryView({ nodes, onDelete, deletingId }: GroupedMemoryViewProps) {
  const grouped = groupNodes(nodes)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {grouped.map(({ group, nodes: groupNodes }) => (
        <GroupSection
          key={group.label}
          group={group}
          nodes={groupNodes}
          onDelete={onDelete}
          deletingId={deletingId}
          defaultOpen={false}
        />
      ))}
    </div>
  )
}
