'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { Copy, Plus, Trash2, UserMinus, X } from 'lucide-react'
import type {
  SharedMemoryNode,
  SpaceMember,
  SpaceMetadata,
  SpaceRole,
} from '@/types/spaces'
import { MEMORY_CATEGORIES } from '@/types/spaces'
import type { MemoryCategory, LifeNode } from '@/types/memory'

type Tab = 'memories' | 'members' | 'settings'

interface Props {
  data: {
    space: SpaceMetadata
    members: SpaceMember[]
    userRole: SpaceRole
  }
  onReload: () => void
}

export default function SpaceDetailView({ data, onReload }: Props) {
  const { space, members, userRole } = data
  const [tab, setTab] = useState<Tab>('memories')

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-4">
        <div className="text-4xl leading-none">{space.emoji}</div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-medium text-[var(--missi-text-primary)] m-0 truncate">
            {space.name}
          </h1>
          <p className="text-xs text-[var(--missi-text-muted)] m-0 capitalize">
            {space.category} · {members.length} member
            {members.length === 1 ? '' : 's'}
          </p>
          {space.description ? (
            <p className="text-sm text-[var(--missi-text-secondary)] mt-2 mb-0">{space.description}</p>
          ) : null}
        </div>
      </header>

      <nav className="flex gap-1 border-b border-[var(--missi-border)]">
        {(['memories', 'members', ...(userRole === 'owner' ? (['settings'] as const) : [])] as Tab[]).map(
          (t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className="px-3 py-2 text-xs font-medium capitalize"
              style={{
                color: tab === t ? 'var(--missi-text-primary)' : 'var(--missi-text-secondary)',
                background: 'transparent',
                border: 'none',
                borderBottom:
                  tab === t
                    ? '1px solid var(--missi-text-primary)'
                    : '1px solid transparent',
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ),
        )}
      </nav>

      {tab === 'memories' ? (
        <MemoriesTab space={space} userRole={userRole} />
      ) : tab === 'members' ? (
        <MembersTab
          space={space}
          members={members}
          userRole={userRole}
          onReload={onReload}
        />
      ) : (
        <SettingsTab space={space} onReload={onReload} />
      )}
    </div>
  )
}

// ─── Memories tab ────────────────────────────────────────────────────────────

function MemoriesTab({
  space,
  userRole,
}: {
  space: SpaceMetadata
  userRole: SpaceRole
}) {
  const [nodes, setNodes] = useState<SharedMemoryNode[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<MemoryCategory | 'all'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [showShare, setShowShare] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const qp = filter === 'all' ? '' : `?category=${filter}`
      const res = await fetch(`/api/v1/spaces/${space.spaceId}/memory${qp}`)
      const j = await res.json()
      if (res.ok && j.success) setNodes(j.data.nodes as SharedMemoryNode[])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  async function deleteNode(id: string) {
    const res = await fetch(
      `/api/v1/spaces/${space.spaceId}/memory/${id}`,
      { method: 'DELETE' },
    )
    if (res.ok) setNodes((arr) => arr.filter((n) => n.id !== id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="All"
        />
        {MEMORY_CATEGORIES.map((c) => (
          <FilterChip
            key={c}
            active={filter === c}
            onClick={() => setFilter(c)}
            label={c}
          />
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowShare((v) => !v)}
          className="px-3 py-1.5 rounded-full text-[11px] font-medium"
          style={chipStyle(showShare)}
        >
          {showShare ? 'Close' : 'Share from my memories'}
        </button>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium"
          style={chipStyle(showAdd)}
        >
          {showAdd ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          <span>{showAdd ? 'Cancel' : 'Add memory'}</span>
        </button>
      </div>

      {showAdd ? (
        <AddMemoryForm
          spaceId={space.spaceId}
          onCreated={() => {
            setShowAdd(false)
            load()
          }}
        />
      ) : null}

      {showShare ? (
        <SharePicker
          spaceId={space.spaceId}
          spaceName={space.name}
          onDone={() => {
            setShowShare(false)
            load()
          }}
        />
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--missi-text-muted)]">Loading memories…</p>
      ) : nodes.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{
            background: 'var(--missi-surface)',
            border: '1px solid var(--missi-border)',
          }}
        >
          <p className="text-sm text-[var(--missi-text-secondary)] mb-1">No shared memories yet.</p>
          <p className="text-xs text-[var(--missi-text-muted)]">
            Add one above or share from your personal memory.
          </p>
        </div>
      ) : (
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}
        >
          {nodes.map((n) => (
            <NodeCard
              key={n.id}
              node={n}
              canDelete={userRole === 'owner'}
              onDelete={() => deleteNode(n.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function NodeCard({
  node,
  canDelete,
  onDelete,
}: {
  node: SharedMemoryNode
  canDelete: boolean
  onDelete: () => void
}) {
  // Contributor can always delete own nodes; owner can delete any.
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <span
          className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded"
          style={{
            color: 'var(--missi-text-secondary)',
            background: 'var(--missi-surface)',
            border: '1px solid var(--missi-border)',
          }}
        >
          {node.category}
        </span>
        {canDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete memory"
            className="text-[var(--missi-text-muted)] hover:text-red-400"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null}
      </div>
      <h4 className="text-sm font-medium text-[var(--missi-text-primary)] m-0 mb-1">
        {node.title}
      </h4>
      <p className="text-xs text-[var(--missi-text-secondary)] m-0 mb-3 line-clamp-3">
        {node.detail}
      </p>
      <p className="text-[10px] text-[var(--missi-text-muted)] m-0">
        Added by {node.contributorDisplayName || 'someone'}
      </p>
    </div>
  )
}

function AddMemoryForm({
  spaceId,
  onCreated,
}: {
  spaceId: string
  onCreated: () => void
}) {
  const [category, setCategory] = useState<MemoryCategory>('event')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [tags, setTags] = useState('')
  const [people, setPeople] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setSubmitting(true)
    setErr(null)
    try {
      const body = {
        category,
        title: title.trim(),
        detail: detail.trim(),
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        people: people
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
        emotionalWeight: 0.5,
      }
      const res = await fetch(`/api/v1/spaces/${spaceId}/memory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await res.json()
      if (res.ok && j.success) {
        setTitle('')
        setDetail('')
        setTags('')
        setPeople('')
        onCreated()
      } else {
        setErr(j.error || 'Failed to save')
      }
    } catch {
      setErr('Failed to save')
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
      }}
    >
      <div className="flex gap-3 flex-wrap">
        <div style={{ flex: 1, minWidth: 140 }}>
          <Label>Category</Label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
            style={inputStyle}
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: 3, minWidth: 200 }}>
          <Label>Title *</Label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
            required
            style={inputStyle}
          />
        </div>
      </div>
      <div>
        <Label>Detail</Label>
        <textarea
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          maxLength={500}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>
      <div className="flex gap-3 flex-wrap">
        <div style={{ flex: 1, minWidth: 180 }}>
          <Label>Tags (comma separated)</Label>
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1, minWidth: 180 }}>
          <Label>People (comma separated)</Label>
          <input
            type="text"
            value={people}
            onChange={(e) => setPeople(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
      {err ? <p className="text-xs text-red-400 m-0">{err}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="px-5 py-2 rounded-full text-xs font-medium active:scale-[0.97]"
          style={{
            border: '1px solid var(--missi-border)',
            background:
              submitting || !title.trim()
                ? 'var(--missi-text-muted)'
                : 'var(--missi-text-primary)',
            color:
              submitting || !title.trim()
                ? 'var(--missi-text-muted)'
                : 'var(--missi-surface)',
            cursor: submitting || !title.trim() ? 'default' : 'pointer',
          }}
        >
          {submitting ? 'Saving…' : 'Save memory'}
        </button>
      </div>
    </form>
  )
}

function SharePicker({
  spaceId,
  spaceName,
  onDone,
}: {
  spaceId: string
  spaceName: string
  onDone: () => void
}) {
  const [nodes, setNodes] = useState<LifeNode[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [sharing, setSharing] = useState<string | null>(null)
  const [justShared, setJustShared] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/v1/memory')
        const j = await res.json()
        if (j.success) {
          const ns = (j.data?.nodes as LifeNode[]) ?? []
          setNodes(ns)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const filtered = nodes.filter((n) =>
    !query.trim()
      ? true
      : (n.title + ' ' + n.detail).toLowerCase().includes(query.toLowerCase()),
  )

  async function share(id: string) {
    setSharing(id)
    try {
      const res = await fetch(
        `/api/v1/spaces/${spaceId}/memory/share`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personalNodeId: id }),
        },
      )
      if (res.ok) {
        setJustShared(id)
        setTimeout(() => {
          setJustShared(null)
          onDone()
        }, 800)
      }
    } finally {
      setSharing(null)
    }
  }

  return (
    <div
      className="rounded-2xl p-5 flex flex-col gap-3"
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
      }}
    >
      <div>
        <Label>Share from your personal memory</Label>
        <input
          type="text"
          placeholder="Search your memories…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={inputStyle}
        />
      </div>
      {loading ? (
        <p className="text-sm text-[var(--missi-text-muted)]">Loading your memories…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--missi-text-muted)]">
          No personal memories found{query ? ` for "${query}"` : ''}.
        </p>
      ) : (
        <ul
          className="flex flex-col gap-2 max-h-80 overflow-y-auto"
          style={{ listStyle: 'none', padding: 0, margin: 0 }}
        >
          {filtered.slice(0, 50).map((n) => (
            <li
              key={n.id}
              className="flex items-start gap-3 rounded-lg p-3"
              style={{
                background: 'var(--missi-surface)',
                border: '1px solid var(--missi-border)',
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--missi-text-secondary)] m-0 mb-0.5 capitalize">
                  {n.category}
                </p>
                <p className="text-sm text-[var(--missi-text-primary)] m-0 mb-0.5 truncate">
                  {n.title}
                </p>
                <p className="text-xs text-[var(--missi-text-muted)] m-0 line-clamp-2">
                  {n.detail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => share(n.id)}
                disabled={sharing === n.id}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap"
                style={chipStyle(justShared === n.id)}
              >
                {justShared === n.id
                  ? 'Shared ✓'
                  : sharing === n.id
                    ? 'Sharing…'
                    : `Share to ${spaceName}`}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Members tab ─────────────────────────────────────────────────────────────

function MembersTab({
  space,
  members,
  userRole,
  onReload,
}: {
  space: SpaceMetadata
  members: SpaceMember[]
  userRole: SpaceRole
  onReload: () => void
}) {
  const router = useRouter()
  const [invite, setInvite] = useState<{
    token: string
    inviteUrl: string
    expiresAt: number
  } | null>(null)
  const [inviteErr, setInviteErr] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function createInvite() {
    setCreating(true)
    setInviteErr(null)
    try {
      const res = await fetch(
        `/api/v1/spaces/${space.spaceId}/invite`,
        { method: 'POST' },
      )
      const j = await res.json()
      if (res.ok && j.success) setInvite(j.data)
      else setInviteErr(j.error || 'Failed to create invite')
    } finally {
      setCreating(false)
    }
  }

  async function removeMember(memberUserId: string) {
    const isSelf = !userRole /* noop, just for clarity */
    void isSelf
    if (
      !confirm(
        memberUserId === space.ownerUserId
          ? 'Remove the owner? Ownership will transfer to the longest-standing member.'
          : 'Remove this member from the Space?',
      )
    )
      return
    const res = await fetch(
      `/api/v1/spaces/${space.spaceId}/members/${memberUserId}`,
      { method: 'DELETE' },
    )
    const j = await res.json()
    if (res.ok && j.success) {
      if (j.data.dissolved) router.push('/spaces')
      else onReload()
    }
  }

  async function leaveSelf(selfId: string) {
    if (
      !confirm(
        members.length === 1
          ? 'You are the last member — leaving will dissolve this Space permanently. Continue?'
          : 'Leave this Space? You will lose access immediately.',
      )
    )
      return
    const res = await fetch(
      `/api/v1/spaces/${space.spaceId}/members/${selfId}`,
      { method: 'DELETE' },
    )
    const j = await res.json().catch(() => ({}))
    if (res.ok) router.push('/spaces')
    else alert(j.error || 'Failed to leave')
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="rounded-2xl p-5"
        style={{
          background: 'var(--missi-surface)',
          border: '1px solid var(--missi-border)',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-[var(--missi-text-primary)] m-0">
            Invite someone
          </h3>
          <button
            type="button"
            onClick={createInvite}
            disabled={creating}
            className="px-3 py-1.5 rounded-full text-[11px] font-medium"
            style={chipStyle(false)}
          >
            {creating ? 'Generating…' : 'Generate invite link'}
          </button>
        </div>
        {invite ? (
          <div className="flex items-center gap-2 flex-wrap">
            <code
              className="text-xs px-3 py-2 rounded-lg flex-1 min-w-0 truncate"
              style={{
                background: 'var(--missi-surface)',
                border: '1px solid var(--missi-border)',
                color: 'var(--missi-text-secondary)',
              }}
            >
              {invite.inviteUrl}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(invite.inviteUrl)}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-[11px]"
              style={chipStyle(false)}
            >
              <Copy className="w-3 h-3" /> Copy
            </button>
            <p className="text-[10px] text-[var(--missi-text-muted)] w-full m-0">
              Expires {new Date(invite.expiresAt).toLocaleString()} · single use
            </p>
          </div>
        ) : inviteErr ? (
          <p className="text-xs text-red-400 m-0">{inviteErr}</p>
        ) : (
          <p className="text-[11px] text-[var(--missi-text-muted)] m-0">
            Each link works for one person only and expires after 48 hours.
          </p>
        )}
      </div>

      <ul
        className="flex flex-col gap-2"
        style={{ listStyle: 'none', padding: 0, margin: 0 }}
      >
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex items-center gap-3 rounded-xl p-3"
            style={{
              background: 'var(--missi-surface)',
              border: '1px solid var(--missi-border)',
            }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-[var(--missi-text-primary)] m-0 truncate">
                {m.displayName}
              </p>
              <p className="text-[11px] text-[var(--missi-text-muted)] m-0">
                {m.role === 'owner' ? 'Owner · ' : 'Member · '}
                joined {new Date(m.joinedAt).toLocaleDateString()}
              </p>
            </div>
            {userRole === 'owner' && m.role !== 'owner' ? (
              <button
                type="button"
                onClick={() => removeMember(m.userId)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px]"
                style={chipStyle(false)}
              >
                <UserMinus className="w-3 h-3" /> Remove
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      <LeaveSpaceButton onLeft={leaveSelf} />
    </div>
  )
}

function LeaveSpaceButton({ onLeft }: { onLeft: (selfId: string) => void }) {
  const { user } = useUser()
  if (!user?.id) return null
  return (
    <button
      type="button"
      onClick={() => onLeft(user.id)}
      className="px-3 py-1.5 rounded-full text-[11px] font-medium"
      style={{
        ...chipStyle(false),
        color: 'rgba(248,113,113,0.9)',
        borderColor: 'rgba(248,113,113,0.25)',
      }}
    >
      Leave Space
    </button>
  )
}

// ─── Settings tab (owner only) ───────────────────────────────────────────────

function SettingsTab({
  space,
  onReload,
}: {
  space: SpaceMetadata
  onReload: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(space.name)
  const [description, setDescription] = useState(space.description)
  const [emoji, setEmoji] = useState(space.emoji)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [dissolveConfirm, setDissolveConfirm] = useState('')

  async function save() {
    setSaving(true)
    setErr(null)
    try {
      const res = await fetch(`/api/v1/spaces/${space.spaceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, emoji }),
      })
      const j = await res.json()
      if (res.ok && j.success) onReload()
      else setErr(j.error || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function dissolve() {
    if (dissolveConfirm !== 'DISSOLVE') return
    const res = await fetch(`/api/v1/spaces/${space.spaceId}`, {
      method: 'DELETE',
    })
    if (res.ok) router.push('/spaces')
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-2xl p-5 flex flex-col gap-3"
        style={{
          background: 'var(--missi-surface)',
          border: '1px solid var(--missi-border)',
        }}
      >
        <h3 className="text-sm font-medium text-[var(--missi-text-primary)] m-0">Edit Space</h3>
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
          <div style={{ flex: 1, minWidth: 200 }}>
            <Label>Name</Label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              style={inputStyle}
            />
          </div>
        </div>
        <div>
          <Label>Description</Label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
        {err ? <p className="text-xs text-red-400 m-0">{err}</p> : null}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-full text-xs font-medium"
            style={chipStyle(false)}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      <div
        className="rounded-2xl p-5 flex flex-col gap-3"
        style={{
          background: 'rgba(30,15,18,0.55)',
          border: '1px solid rgba(248,113,113,0.25)',
        }}
      >
        <h3 className="text-sm font-medium text-red-300 m-0">Danger zone</h3>
        <p className="text-xs text-[var(--missi-text-secondary)] m-0">
          Dissolving this Space permanently deletes all of its shared memories,
          members, and invites. This cannot be undone. Type{' '}
          <strong>DISSOLVE</strong> below to confirm.
        </p>
        <input
          type="text"
          value={dissolveConfirm}
          onChange={(e) => setDissolveConfirm(e.target.value)}
          placeholder="Type DISSOLVE"
          style={inputStyle}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={dissolve}
            disabled={dissolveConfirm !== 'DISSOLVE'}
            className="px-5 py-2 rounded-full text-xs font-medium"
            style={{
              border: '1px solid rgba(248,113,113,0.4)',
              background:
                dissolveConfirm === 'DISSOLVE'
                  ? 'rgba(248,113,113,0.9)'
                  : 'rgba(248,113,113,0.1)',
              color:
                dissolveConfirm === 'DISSOLVE'
                  ? 'var(--missi-surface)'
                  : 'rgba(248,113,113,0.6)',
              cursor:
                dissolveConfirm === 'DISSOLVE' ? 'pointer' : 'not-allowed',
            }}
          >
            Dissolve Space
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── shared styles ───────────────────────────────────────────────────────────

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

function chipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? 'var(--missi-border)' : 'var(--missi-surface)',
    border: '1px solid var(--missi-border)',
    color: 'var(--missi-text-secondary)',
    cursor: 'pointer',
  }
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1 rounded-full text-[11px] font-medium capitalize"
      style={{
        background: active ? 'var(--missi-border)' : 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
        color: active ? 'var(--missi-text-primary)' : 'var(--missi-text-secondary)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
