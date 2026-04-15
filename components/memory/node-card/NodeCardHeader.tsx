import { Trash2 } from 'lucide-react'
import type { LifeNode, MemoryCategory } from '@/types/memory'

const CATEGORY_COLORS: Record<MemoryCategory, { bg: string; text: string; border: string }> = {
  person:       { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  goal:         { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  habit:        { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  preference:   { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  event:        { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  emotion:      { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  skill:        { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  place:        { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  belief:       { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
  relationship: { bg: 'rgba(255,255,255,0.05)', text: 'rgba(255,255,255,0.9)', border: 'rgba(255,255,255,0.15)' },
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
          color: 'rgba(255,255,255,0.85)',
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
          color: confirming ? '#ef4444' : 'rgba(255,255,255,0.3)',
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
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: 'rgba(255,255,255,0.7)',
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
