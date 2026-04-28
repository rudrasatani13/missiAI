'use client'

import { useState, useRef, useEffect, memo } from 'react'
import type { LifeNode } from '@/types/memory'
import { NodeCardHeader } from './node-card/NodeCardHeader'
import { NodeCardBody } from './node-card/NodeCardBody'

interface NodeCardProps {
  node: LifeNode
  onDelete: (id: string) => void
  isDeleting: boolean
}

export const NodeCard = memo(function NodeCard({ node, onDelete, isDeleting }: NodeCardProps) {
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

  return (
    <div
      className="glass-card glass-noise"
      style={{
        borderRadius: '16px',
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
      <NodeCardHeader
        node={node}
        isDeleting={isDeleting}
        confirming={confirming}
        onDeleteClick={handleDeleteClick}
      />
      <NodeCardBody node={node} />
    </div>
  )
})
