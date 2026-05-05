import { Trash2 } from 'lucide-react'
import type { LifeNode, MemoryCategory } from '@/types/memory'

const CATEGORY_COLORS: Record<MemoryCategory, { bg: string; text: string; border: string }> = {
  person:       { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  goal:         { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  habit:        { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  preference:   { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  event:        { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  emotion:      { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  skill:        { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  place:        { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  belief:       { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
  relationship: { bg: 'var(--missi-border)', text: 'var(--missi-border-strong)', border: 'var(--missi-border-strong)' },
}

interface NodeCardHeaderProps {
  node: LifeNode
  isDeleting: boolean
  confirming: boolean
  onDeleteClick: (e: React.MouseEvent) => void
}

export function NodeCardHeader({
  node,
  isDeleting,
  confirming,
  onDeleteClick,
}: NodeCardHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <span
        style={{
          fontSize: '10px',
          color: CATEGORY_COLORS[node.category].text,
          background: CATEGORY_COLORS[node.category].bg,
          border: `1px solid ${CATEGORY_COLORS[node.category].border}`,
          borderRadius: '999px',
          padding: '2px 8px',
          flexShrink: 0,
          fontWeight: 500,
          letterSpacing: '0.3px',
        }}
      >
        {node.category}
      </span>
      <span
        style={{
          flex: 1,
          fontSize: '14px',
          color: 'var(--missi-text-primary)',
          fontWeight: 500,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={node.title}
      >
        {node.title}
      </span>
      <button
        onClick={onDeleteClick}
        title={confirming ? 'Click again to confirm deletion' : 'Delete memory'}
        style={{
          background: 'none',
          border: confirming ? '1px solid rgba(239,68,68,0.4)' : 'none',
          borderRadius: '6px',
          cursor: 'pointer',
          color: confirming ? '#ef4444' : 'var(--missi-text-muted)',
          padding: '4px 6px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          transition: 'color 0.15s, border-color 0.15s',
          flexShrink: 0,
          fontSize: '10px',
        }}
      >
        {isDeleting ? (
          <span
            style={{
              display: 'inline-block',
              width: '14px',
              height: '14px',
              border: '2px solid var(--missi-border-strong)',
              borderTopColor: 'var(--missi-border-strong)',
              borderRadius: '50%',
              animation: 'spin 0.6s linear infinite',
            }}
          />
        ) : (
          <Trash2 style={{ width: '14px', height: '14px' }} />
        )}
        {confirming && !isDeleting && <span>Confirm?</span>}
      </button>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
