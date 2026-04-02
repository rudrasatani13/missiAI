'use client'

import { useState, useRef, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import type { LifeNode, MemoryCategory } from '@/types/memory'

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  person: '#7C3AED',
  goal: '#059669',
  habit: '#D97706',
  preference: '#2563EB',
  event: '#DC2626',
  emotion: '#9333EA',
  skill: '#0891B2',
  place: '#65A30D',
  belief: '#C2410C',
  relationship: '#BE185D',
}

interface NodeCardProps {
  node: LifeNode
  onDelete: (id: string) => void
  isDeleting: boolean
}

export function NodeCard({ node, onDelete, isDeleting }: NodeCardProps) {
  const [confirming, setConfirming] = useState(false)
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDeleting) return
    if (confirming) {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
      setConfirming(false)
      onDelete(node.id)
    } else {
      setConfirming(true)
      confirmTimeoutRef.current = setTimeout(() => {
        setConfirming(false)
      }, 3000)
    }
  }

  useEffect(() => {
    return () => {
      if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current)
    }
  }, [])

  const confidenceColor =
    node.confidence > 0.7
      ? '#22c55e'
      : node.confidence >= 0.4
        ? '#f59e0b'
        : '#ef4444'

  const visibleTags = node.tags.slice(0, 4)
  const extraTagCount = node.tags.length - 4

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '12px',
        padding: '16px',
        opacity: isDeleting ? 0.5 : 1,
        pointerEvents: isDeleting ? 'none' : 'auto',
        transition: 'border-color 0.2s, opacity 0.2s',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
      onMouseEnter={(e) => {
        if (!isDeleting) {
          ;(e.currentTarget as HTMLDivElement).style.borderColor =
            'rgba(255,255,255,0.15)'
        }
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLDivElement).style.borderColor =
          'rgba(255,255,255,0.08)'
      }}
    >
      {/* Top row: category badge + title + delete */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontSize: '10px',
            color: '#fff',
            background: CATEGORY_COLORS[node.category],
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
          onClick={handleDeleteClick}
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
      </div>

      {/* Detail text */}
      {node.detail && (
        <p
          style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.5)',
            margin: 0,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            lineHeight: '1.5',
          }}
        >
          {node.detail}
        </p>
      )}

      {/* Tags */}
      {node.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {visibleTags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.5)',
                background: 'rgba(255,255,255,0.08)',
                borderRadius: '999px',
                padding: '2px 8px',
              }}
            >
              {tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span
              style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.35)',
                padding: '2px 4px',
              }}
            >
              +{extraTagCount} more
            </span>
          )}
        </div>
      )}

      {/* Bottom row: source + confidence bar + access count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            fontSize: '10px',
            color: 'rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}
        >
          {node.source}
        </span>
        <div
          style={{
            flex: 1,
            height: '4px',
            background: 'rgba(255,255,255,0.08)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${node.confidence * 100}%`,
              background: confidenceColor,
              borderRadius: '2px',
              transition: 'width 0.3s',
            }}
          />
        </div>
        <span
          style={{
            fontSize: '10px',
            color: 'rgba(255,255,255,0.3)',
            flexShrink: 0,
          }}
        >
          {node.accessCount} access{node.accessCount !== 1 ? 'es' : ''}
        </span>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
