'use client'


import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Brain, RefreshCw, Plus, X } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import { motion } from 'framer-motion'
import { useMemoryDashboard } from '@/hooks/memory/useMemoryDashboard'
import { StatsBar } from '@/components/memory/StatsBar'
import { CategoryFilter } from '@/components/memory/CategoryFilter'
import { MemorySearch } from '@/components/memory/MemorySearch'
import { GroupedMemoryView } from '@/components/memory/GroupedMemoryView'
import { ScrollReveal } from '@/components/effects/ScrollReveal'
import { ChatShell } from '@/components/shell/ChatShell'
import type { MemoryCategory } from '@/types/memory'

const CATEGORIES: MemoryCategory[] = [
  'person', 'goal', 'habit', 'preference', 'event',
  'emotion', 'skill', 'place', 'belief', 'relationship',
]

function GlassCard({
  children,
  className = '',
  delay = 0,
  glow: _glow,
  style,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  glow?: string
  style?: React.CSSProperties
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-2xl ${className}`}
      style={{
        background: 'var(--missi-surface)',
        border: '1px solid var(--missi-border)',
        boxShadow: 'none',
        ...style,
      }}
    >
      {children}
    </motion.div>
  )
}

export default function MemoryPage() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useUser()

  const {
    graph,
    isLoading,
    error,
    selectedCategory,
    searchQuery,
    deletingId,
    filteredNodes,
    categoryCounts,
    stats,
    deleteNode,
    updateSearch,
    updateCategory,
    refreshGraph,
  } = useMemoryDashboard(isLoaded && !!isSignedIn)

  const [showAddForm, setShowAddForm] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [addCategory, setAddCategory] = useState<MemoryCategory>('goal')
  const [addTitle, setAddTitle] = useState('')
  const [addDetail, setAddDetail] = useState('')
  const [addTags, setAddTags] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isLoaded, isSignedIn, router])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await refreshGraph()
    setIsRefreshing(false)
  }

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!addTitle.trim() || !addDetail.trim()) return
    setIsSubmitting(true)
    setAddError(null)
    try {
      const content = `${addTitle.trim()}. ${addDetail.trim()}`
      const res = await fetch('/api/v1/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: [{ role: 'user', content }],
          interactionCount: 5,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setAddTitle('')
        setAddDetail('')
        setAddTags('')
        setAddCategory('goal')
        setShowAddForm(false)
        await refreshGraph()
      } else {
        setAddError(data.error ?? 'Failed to add memory')
      }
    } catch {
      setAddError('Failed to add memory')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isEmptyGraph = !isLoading && graph && graph.nodes.length === 0
  const hasNoResults =
    !isLoading && !isEmptyGraph && filteredNodes.length === 0 && (selectedCategory !== 'all' || searchQuery.trim().length >= 2)

  return (
    <ChatShell>
      {/* Ambient field — soft violet (memory palette). Contained inside the
          rounded main card (absolute, not fixed) so it doesn't bleed past the
          floating shell's margins. */}
      <div aria-hidden className="absolute inset-0 pointer-events-none z-0" style={{
        background: 'radial-gradient(500px circle at 20% 15%, rgba(139,92,246,0.07), transparent 60%), radial-gradient(420px circle at 82% 88%, rgba(109,40,217,0.05), transparent 65%)',
        filter: 'blur(100px)',
      }} />

      <div
        className="relative z-10 max-w-[900px] mx-auto px-4 md:px-6 pb-6 md:py-8"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      >

        {/* ── Header ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col gap-3 mb-6 md:flex-row md:items-center md:justify-between md:mb-7"
        >
          {/* Top row: Title · Refresh (sidebar provides nav) */}
          <div className="flex items-center justify-between md:justify-start md:gap-4">
            <div className="flex items-center gap-2.5">
              <Brain className="w-5 h-5" style={{ color: 'var(--missi-text-muted)' }} />
              <h1 className="text-base md:text-lg font-medium m-0" style={{ color: 'var(--missi-text-primary)' }}>
                Saved Memory
              </h1>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh"
              className="p-1.5 rounded-full transition-colors hover:bg-[var(--missi-nav-hover)] active:scale-[0.97] md:hidden"
              style={{
                background: 'none',
                border: 'none',
                cursor: isRefreshing ? 'default' : 'pointer',
                color: 'var(--missi-text-muted)',
              }}
            >
              <RefreshCw
                className="w-3.5 h-3.5"
                style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}
              />
            </button>
          </div>

          {/* Bottom row on mobile / right-aligned on desktop: add + refresh */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors active:scale-[0.97] flex-shrink-0"
              style={{
                background: showAddForm ? 'var(--missi-nav-active-bg)' : 'var(--missi-surface)',
                border: '1px solid var(--missi-border)',
                color: 'var(--missi-nav-text-active)',
                cursor: 'pointer',
              }}
            >
              {showAddForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
              <span>{showAddForm ? 'Cancel' : 'Add'}</span>
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh"
              className="p-1.5 rounded-full transition-colors hover:bg-var(--missi-surface-hover) active:scale-[0.97] hidden md:flex flex-shrink-0"
              style={{
                background: 'none',
                border: 'none',
                cursor: isRefreshing ? 'default' : 'pointer',
                color: 'var(--missi-text-muted)',
              }}
            >
              <RefreshCw
                className="w-3.5 h-3.5"
                style={{ animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none' }}
              />
            </button>
          </div>
        </motion.div>

        {/* ── Add Memory Form ───────────────────────────────────────── */}
        <div
          style={{
            overflow: 'hidden',
            maxHeight: showAddForm ? '600px' : '0px',
            transition: 'max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
            marginBottom: showAddForm ? '16px' : '0px',
          }}
        >
          <GlassCard className="mb-0">
            <form
              onSubmit={handleAddMemory}
              className="p-5 flex flex-col gap-3.5"
            >
              <p className="text-[12px] font-light m-0" style={{ color: 'var(--missi-text-secondary)' }}>
                Add a memory manually — Missi will extract and store the key facts.
              </p>

              <div className="flex gap-3 flex-wrap">
                <div className="flex-1" style={{ minWidth: '140px' }}>
                  <label style={labelStyle}>Category</label>
                  <select
                    value={addCategory}
                    onChange={(e) => setAddCategory(e.target.value as MemoryCategory)}
                    style={inputStyle}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: '3', minWidth: '200px' }}>
                  <label style={labelStyle}>Title *</label>
                  <input
                    type="text"
                    value={addTitle}
                    onChange={(e) => setAddTitle(e.target.value)}
                    placeholder="e.g. I love hiking on weekends"
                    maxLength={80}
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Detail *</label>
                <textarea
                  value={addDetail}
                  onChange={(e) => setAddDetail(e.target.value)}
                  placeholder="Add more context..."
                  maxLength={500}
                  required
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              <div>
                <label style={labelStyle}>Tags (comma separated)</label>
                <input
                  type="text"
                  value={addTags}
                  onChange={(e) => setAddTags(e.target.value)}
                  placeholder="e.g. fitness, outdoors, weekend"
                  style={inputStyle}
                />
              </div>

              {addError && (
                <p className="text-xs m-0" style={{ color: 'hsl(var(--destructive))' }}>
                  {addError}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !addTitle.trim() || !addDetail.trim()}
                  className="px-5 py-2 rounded-full text-xs font-medium transition-colors active:scale-[0.97]"
                  style={{
                    border: '1px solid var(--missi-border)',
                    background:
                      isSubmitting || !addTitle.trim() || !addDetail.trim()
                        ? 'var(--missi-surface)'
                        : 'var(--missi-nav-text-active)',
                    color:
                      isSubmitting || !addTitle.trim() || !addDetail.trim()
                        ? 'var(--missi-text-secondary)'
                        : 'var(--missi-bg)',
                    cursor:
                      isSubmitting || !addTitle.trim() || !addDetail.trim()
                        ? 'default'
                        : 'pointer',
                  }}
                >
                  {isSubmitting ? 'Adding…' : 'Add Memory'}
                </button>
              </div>
            </form>
          </GlassCard>
        </div>

        {/* ── Stats ─────────────────────────────────────────────────── */}
        <ScrollReveal>
          <GlassCard className="px-5 py-4 mb-4" delay={0.1}>
            <StatsBar stats={stats} />
          </GlassCard>
        </ScrollReveal>

        {/* ── Search + Filters ──────────────────────────────────────── */}
        <ScrollReveal delay={0.05}>
          <GlassCard className="px-5 py-4 mb-4" delay={0.15}>
            <div className="mb-3">
              <MemorySearch
                query={searchQuery}
                onChange={updateSearch}
                resultCount={filteredNodes.length}
              />
            </div>
            <CategoryFilter
              selected={selectedCategory}
              counts={categoryCounts}
              onChange={updateCategory}
            />
          </GlassCard>
        </ScrollReveal>

        {/* ── Content ───────────────────────────────────────────────── */}
        <ScrollReveal delay={0.1}>
        <GlassCard className="px-5 py-5 mb-8" delay={0.2}>
          {isLoading ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-xl"
                  style={{
                    background: 'var(--missi-surface)',
                    border: '1px solid var(--missi-border)',
                    height: '120px',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                />
              ))}
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm mb-4" style={{ color: 'var(--missi-text-secondary)' }}>{error}</p>
              <button
                onClick={handleRefresh}
                className="px-5 py-2 rounded-full text-xs font-medium transition-colors active:scale-[0.97]"
                style={{
                  border: '1px solid var(--missi-border)',
                  background: 'var(--missi-surface)',
                  color: 'var(--missi-text-primary)',
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
            </div>
          ) : isEmptyGraph ? (
            <div className="text-center py-16 px-4">
              <div
                className="w-14 h-14 rounded-full mx-auto mb-5 flex items-center justify-center"
                style={{ background: 'var(--missi-surface)', border: '1px solid var(--missi-border)' }}
              >
                <Brain className="w-6 h-6" style={{ color: 'var(--missi-text-muted)' }} />
              </div>
              <p className="text-base font-light mb-2" style={{ color: 'var(--missi-text-secondary)' }}>
                No memories yet
              </p>
              <p className="text-xs font-light mb-6" style={{ color: 'var(--missi-text-muted)' }}>
                Start a conversation and Missi will remember what matters.
              </p>
              <Link
                href="/chat"
                className="inline-flex px-5 py-2 rounded-full text-xs font-medium no-underline transition-colors active:scale-[0.97]"
                style={{
                  border: '1px solid var(--missi-border)',
                  background: 'var(--missi-nav-text-active)',
                  color: 'var(--missi-bg)',
                }}
              >
                Start a conversation
              </Link>
            </div>
          ) : hasNoResults ? (
            <div className="text-center py-14" style={{ color: 'var(--missi-text-muted)' }}>
              <p className="text-sm font-light">
                {searchQuery.trim().length >= 2
                  ? `No results for "${searchQuery.trim()}"`
                  : 'No memories in this category'}
              </p>
            </div>
          ) : (
            <GroupedMemoryView
              nodes={filteredNodes}
              onDelete={deleteNode}
              deletingId={deletingId}
            />
          )}
        </GlassCard>
        </ScrollReveal>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </ChatShell>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '10px',
  color: 'var(--missi-text-muted)',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.18em',
  fontWeight: 600,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--missi-input-bg)',
  border: '1px solid var(--missi-input-border)',
  borderRadius: '10px',
  padding: '10px 12px',
  color: 'var(--missi-input-text)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 0.15s',
}
