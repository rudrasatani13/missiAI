'use client'

import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { SpaceSummary, SpaceCategory } from '@/types/spaces'
import SpaceCard from './SpaceCard'

const CATEGORIES: { value: SpaceCategory; label: string; emoji: string }[] = [
  { value: 'couple', label: 'Couple', emoji: '💞' },
  { value: 'family', label: 'Family', emoji: '🏡' },
  { value: 'friends', label: 'Friends', emoji: '🤝' },
  { value: 'study', label: 'Study group', emoji: '📚' },
  { value: 'work', label: 'Work', emoji: '💼' },
  { value: 'other', label: 'Other', emoji: '✨' },
]

export default function SpacesDashboard() {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/v1/spaces')
      const data = await res.json()
      if (res.ok && data.success) {
        setSpaces(data.data as SpaceSummary[])
      } else {
        setError(data.error || 'Failed to load Spaces')
      }
    } catch {
      setError('Failed to load Spaces')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--missi-text-muted)] m-0">
          Share memory with the people closest to you.
        </p>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors active:scale-[0.97]"
          style={{
            background: showCreate
              ? 'var(--missi-text-muted)'
              : 'var(--missi-text-muted)',
            border: '1px solid var(--missi-border)',
            color: 'var(--missi-text-secondary)',
            cursor: 'pointer',
          }}
        >
          {showCreate ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          <span>{showCreate ? 'Cancel' : 'Create Space'}</span>
        </button>
      </div>

      <div
        style={{
          overflow: 'hidden',
          maxHeight: showCreate ? '600px' : '0px',
          transition: 'max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <CreateSpaceForm
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      </div>

      {loading ? (
        <p className="text-sm text-[var(--missi-text-muted)]">Loading your Spaces…</p>
      ) : error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : spaces.length === 0 ? (
        <EmptyState />
      ) : (
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
        >
          {spaces.map((s) => (
            <SpaceCard key={s.spaceId} summary={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
      }}
    >
      <div className="text-4xl mb-3">🫂</div>
      <p className="text-sm text-[var(--missi-text-secondary)] mb-1">You&apos;re not in any Spaces yet.</p>
      <p className="text-xs text-[var(--missi-text-muted)]">
        Create one or ask someone to invite you.
      </p>
    </div>
  )
}

function CreateSpaceForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<SpaceCategory>('family')
  const [emoji, setEmoji] = useState('🏡')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    setErr(null)
    try {
      const res = await fetch('/api/v1/spaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category,
          emoji,
        }),
      })
      const data = await res.json()
      if (res.ok && data.success) {
        setName('')
        setDescription('')
        onCreated()
      } else {
        setErr(data.error || 'Failed to create Space')
      }
    } catch {
      setErr('Failed to create Space')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
        marginBottom: 4,
      }}
    >
      <div className="flex gap-3 flex-wrap">
        <div style={{ width: 80 }}>
          <Label>Emoji</Label>
          <input
            type="text"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value.slice(0, 4))}
            maxLength={4}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 2, minWidth: 200 }}>
          <Label>Name *</Label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            required
            placeholder="e.g. Team Satani"
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, minWidth: 140 }}>
          <Label>Category</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as SpaceCategory)}
            style={inputStyle}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <Label>Description</Label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
          rows={2}
          placeholder="Optional — what is this Space for?"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {err ? <p className="text-xs text-red-400 m-0">{err}</p> : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="px-5 py-2 rounded-full text-xs font-medium active:scale-[0.97]"
          style={{
            border: '1px solid var(--missi-border)',
            background: submitting || !name.trim() ? 'var(--missi-surface)' : 'var(--missi-border)',
            color: submitting || !name.trim() ? 'var(--missi-text-muted)' : 'var(--missi-surface)',
            cursor: submitting || !name.trim() ? 'default' : 'pointer',
          }}
        >
          {submitting ? 'Creating…' : 'Create Space'}
        </button>
      </div>
    </form>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: '10px',
        color: 'var(--missi-text-muted)',
        marginBottom: '6px',
        textTransform: 'uppercase',
        letterSpacing: '0.18em',
        fontWeight: 600,
      }}
    >
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--missi-border)',
  border: '1px solid var(--missi-border)',
  borderRadius: '10px',
  padding: '10px 12px',
  color: 'var(--missi-text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}
