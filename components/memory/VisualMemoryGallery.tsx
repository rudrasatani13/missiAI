'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import type { VisualMemoryRecord, VisualMemoryCategory } from '@/types/visual-memory'

// ─── Category Metadata ────────────────────────────────────────────────────────

const CATEGORY_EMOJI: Record<VisualMemoryCategory, string> = {
  food:        '🍽️',
  product:     '📦',
  contact:     '👤',
  event:       '📅',
  document:    '📄',
  place:       '📍',
  receipt:     '🧾',
  inspiration: '✨',
  general:     '📸',
}

const CATEGORY_LABEL: Record<VisualMemoryCategory, string> = {
  food:        'Food',
  product:     'Product',
  contact:     'Contact',
  event:       'Event',
  document:    'Document',
  place:       'Place',
  receipt:     'Receipt',
  inspiration: 'Inspiration',
  general:     'General',
}

const ALL_CATEGORIES: VisualMemoryCategory[] = [
  'food', 'product', 'contact', 'event', 'document',
  'place', 'receipt', 'inspiration', 'general',
]

// ─── Card Component ───────────────────────────────────────────────────────────

interface CardProps {
  record: VisualMemoryRecord
  onDelete: (nodeId: string) => void
}

function VisualMemoryCard({ record, onDelete }: CardProps) {
  const [expanded, setExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const emoji = CATEGORY_EMOJI[record.category] ?? '📸'

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      const res = await fetch('/api/v1/visual-memory', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: record.nodeId }),
      })
      if (res.ok) {
        onDelete(record.nodeId)
        toast.success('Removed from visual gallery')
      } else {
        toast.error('Failed to remove — please try again')
      }
    } catch {
      toast.error('Failed to remove — please try again')
    } finally {
      setIsDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.25 }}
      className="group relative rounded-2xl p-4 flex flex-col gap-2 cursor-pointer"
      style={{
        background: 'rgba(12,12,18,0.95)',
        border: '1px solid var(--missi-border)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        minHeight: 140,
      }}
      onClick={() => !confirmDelete && setExpanded((v) => !v)}
    >
      {/* Hover delete button */}
      {!confirmDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
          className="absolute top-2 right-2 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'var(--missi-border)', border: 'none', color: 'var(--missi-border)', cursor: 'pointer' }}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="absolute inset-0 rounded-2xl flex flex-col items-center justify-center gap-2 z-10 p-3"
          style={{ background: 'rgba(8,8,12,0.95)', border: '1px solid var(--missi-border)' }}
          onClick={(e) => e.stopPropagation()}>
          <p className="text-[11px] text-center" style={{ color: 'var(--missi-text-secondary)' }}>
            Remove from gallery?
          </p>
          <p className="text-[10px] text-center" style={{ color: 'var(--missi-text-muted)' }}>
            Memory stays in Missi's graph
          </p>
          <div className="flex gap-2 mt-1">
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-1 rounded-full text-[10px] font-medium transition-all hover:scale-105"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: 'rgba(239,68,68,0.9)', cursor: 'pointer' }}
            >
              {isDeleting ? 'Removing...' : 'Yes, remove'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-3 py-1 rounded-full text-[10px] font-medium transition-all hover:scale-105"
              style={{ background: 'var(--missi-border)', border: '1px solid var(--missi-border)', color: 'var(--missi-border)', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Card content */}
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium leading-snug" style={{ color: 'var(--missi-text-primary)' }}>
            {record.summary}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: 'var(--missi-text-muted)' }}>
            {record.processedDate}
          </p>
        </div>
      </div>

      {record.userNote && (
        <p className="text-[10px] italic leading-relaxed" style={{ color: 'var(--missi-text-muted)' }}>
          "{record.userNote}"
        </p>
      )}

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <p className="text-[10px] italic mt-1" style={{ color: 'var(--missi-text-muted)' }}>
              Tap "{CATEGORY_LABEL[record.category]}" info to ask Missi about this
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tags */}
      {record.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-auto pt-1">
          {record.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="text-[9px] px-2 py-0.5 rounded-full"
              style={{
                background: 'var(--missi-border)',
                border: '1px solid var(--missi-border)',
                color: 'var(--missi-text-muted)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Gallery Component ────────────────────────────────────────────────────────

export function VisualMemoryGallery() {
  const [records, setRecords] = useState<VisualMemoryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<VisualMemoryCategory | 'all'>('all')

  const fetchRecords = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/visual-memory?limit=100')
      const data = await res.json()
      if (data.success) {
        setRecords(data.records ?? [])
      } else {
        setError('Failed to load visual memories')
      }
    } catch {
      setError('Failed to load visual memories')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  const handleDelete = useCallback((nodeId: string) => {
    setRecords((prev) => prev.filter((r) => r.nodeId !== nodeId))
  }, [])

  // Client-side category filter — no refetch needed
  const filtered = activeCategory === 'all'
    ? records
    : records.filter((r) => r.category === activeCategory)

  // Categories that have at least one record
  const activeCats = new Set(records.map((r) => r.category))

  // ── Skeleton Loading ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div>
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-full px-3 py-1 h-7 w-16 flex-shrink-0"
              style={{ background: 'var(--missi-border)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-2xl"
              style={{ height: 140, background: 'var(--missi-surface)', border: '1px solid var(--missi-border)', animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }`}</style>
      </div>
    )
  }

  // ── Error State ──────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-sm mb-4" style={{ color: 'var(--missi-text-muted)' }}>{error}</p>
        <button
          onClick={fetchRecords}
          className="px-5 py-2 rounded-full text-xs font-medium transition-all hover:scale-105"
          style={{ border: '1px solid var(--missi-border-strong)', background: 'var(--missi-border)', color: 'var(--missi-border)', cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    )
  }

  // ── Empty State ──────────────────────────────────────────────────────────────
  if (records.length === 0) {
    return (
      <div className="text-center py-20 px-4">
        <div className="text-5xl mb-4">📸</div>
        <p className="text-base font-light mb-2" style={{ color: 'var(--missi-text-secondary)' }}>
          No visual memories yet
        </p>
        <p className="text-xs font-light mb-6" style={{ color: 'var(--missi-text-muted)' }}>
          Tap the camera icon in chat to save your first one
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Category filter bar */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setActiveCategory('all')}
          className="flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-medium transition-all"
          style={{
            background: activeCategory === 'all' ? 'var(--missi-border)' : 'var(--missi-surface)',
            border: `1px solid ${activeCategory === 'all' ? 'var(--missi-border-strong)' : 'var(--missi-border)'}`,
            color: activeCategory === 'all' ? 'var(--missi-text-primary)' : 'var(--missi-text-muted)',
            cursor: 'pointer',
          }}
        >
          All ({records.length})
        </button>
        {ALL_CATEGORIES.filter((cat) => activeCats.has(cat)).map((cat) => {
          const count = records.filter((r) => r.category === cat).length
          const isActive = activeCategory === cat
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all"
              style={{
                background: isActive ? 'var(--missi-border)' : 'var(--missi-surface)',
                border: `1px solid ${isActive ? 'var(--missi-border-strong)' : 'var(--missi-border)'}`,
                color: isActive ? 'var(--missi-text-primary)' : 'var(--missi-text-muted)',
                cursor: 'pointer',
              }}
            >
              <span>{CATEGORY_EMOJI[cat]}</span>
              <span>{CATEGORY_LABEL[cat]} ({count})</span>
            </button>
          )
        })}
      </div>

      {/* Grid */}
      <motion.div
        layout
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
      >
        <AnimatePresence mode="popLayout">
          {filtered.map((record) => (
            <VisualMemoryCard
              key={record.nodeId}
              record={record}
              onDelete={handleDelete}
            />
          ))}
        </AnimatePresence>
      </motion.div>

      {filtered.length === 0 && activeCategory !== 'all' && (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: 'var(--missi-text-muted)' }}>
            No {CATEGORY_LABEL[activeCategory].toLowerCase()} memories yet
          </p>
        </div>
      )}
    </div>
  )
}
