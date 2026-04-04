'use client'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Brain, RefreshCw } from 'lucide-react'
import { useUser } from '@clerk/nextjs'
import { useMemoryDashboard } from '@/hooks/useMemoryDashboard'
import { StatsBar } from '@/components/memory/StatsBar'
import { CategoryFilter } from '@/components/memory/CategoryFilter'
import { MemorySearch } from '@/components/memory/MemorySearch'
import { GroupedMemoryView } from '@/components/memory/GroupedMemoryView'
import { Magnetic } from '@/components/ui/Magnetic'
import type { MemoryCategory } from '@/types/memory'

const CATEGORIES: MemoryCategory[] = [
  'person',
  'goal',
  'habit',
  'preference',
  'event',
  'emotion',
  'skill',
  'place',
  'belief',
  'relationship',
]

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

  // Redirect if not signed in
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
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: 'rgba(255,255,255,0.85)',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          maxWidth: '900px',
          margin: '0 auto',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '28px',
          }}
        >
          <Magnetic>
            <Link
              href="/chat"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 transition-all text-white/50 hover:text-white/80 no-underline text-xs"
            >
              <ArrowLeft style={{ width: '16px', height: '16px' }} />
              <span className="hidden sm:inline">Back</span>
            </Link>
          </Magnetic>

          <h1
            style={{
              fontSize: '20px',
              fontWeight: 500,
              color: 'rgba(255,255,255,0.9)',
              margin: 0,
            }}
          >
            Your Memory Graph
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              style={{
                fontSize: '12px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: showAddForm
                  ? 'rgba(255,255,255,0.12)'
                  : 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.8)',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {showAddForm ? 'Cancel' : 'Add Memory'}
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh"
              style={{
                background: 'none',
                border: 'none',
                cursor: isRefreshing ? 'default' : 'pointer',
                color: 'rgba(255,255,255,0.4)',
                display: 'flex',
                alignItems: 'center',
                padding: '6px',
                borderRadius: '6px',
                transition: 'color 0.15s',
              }}
            >
              <RefreshCw
                style={{
                  width: '16px',
                  height: '16px',
                  animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none',
                }}
              />
            </button>
          </div>
        </div>

        {/* Add Memory Form */}
        <div
          style={{
            overflow: 'hidden',
            maxHeight: showAddForm ? '600px' : '0px',
            transition: 'max-height 0.3s ease',
            marginBottom: showAddForm ? '20px' : '0px',
          }}
        >
          <form
            onSubmit={handleAddMemory}
            className="glass-card glass-noise"
            style={{
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              marginBottom: '20px',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                color: 'rgba(255,255,255,0.6)',
                margin: 0,
              }}
            >
              Add a memory manually — missiAI will extract and store the key facts.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1', minWidth: '140px' }}>
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
              <p style={{ fontSize: '12px', color: '#ef4444', margin: 0 }}>
                {addError}
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isSubmitting || !addTitle.trim() || !addDetail.trim()}
                style={{
                  padding: '8px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background:
                    isSubmitting || !addTitle.trim() || !addDetail.trim()
                      ? 'rgba(255,255,255,0.1)'
                      : 'rgba(255,255,255,0.18)',
                  color: 'rgba(255,255,255,0.8)',
                  fontSize: '13px',
                  cursor:
                    isSubmitting || !addTitle.trim() || !addDetail.trim()
                      ? 'default'
                      : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {isSubmitting ? 'Adding…' : 'Add Memory'}
              </button>
            </div>
          </form>
        </div>

        {/* Stats */}
        <div style={{ marginBottom: '20px' }}>
          <StatsBar stats={stats} />
        </div>

        {/* Search */}
        <div style={{ marginBottom: '16px' }}>
          <MemorySearch
            query={searchQuery}
            onChange={updateSearch}
            resultCount={filteredNodes.length}
          />
        </div>

        {/* Category filter */}
        <div style={{ marginBottom: '20px' }}>
          <CategoryFilter
            selected={selectedCategory}
            counts={categoryCounts}
            onChange={updateCategory}
          />
        </div>

        {/* Content */}
        {isLoading ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '12px',
            }}
          >
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '12px',
                  padding: '16px',
                  height: '140px',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            ))}
            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 0.5; }
                50% { opacity: 1; }
              }
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
          </div>
        ) : error ? (
          <div
            style={{
              textAlign: 'center',
              padding: '48px 24px',
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            <p style={{ fontSize: '14px', marginBottom: '16px' }}>{error}</p>
            <button
              onClick={handleRefresh}
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        ) : isEmptyGraph ? (
          <div
            style={{
              textAlign: 'center',
              padding: '80px 24px',
            }}
          >
            <Brain
              style={{
                width: '40px',
                height: '40px',
                color: 'rgba(255,255,255,0.1)',
                margin: '0 auto 16px',
              }}
            />
            <p
              style={{
                fontSize: '16px',
                color: 'rgba(255,255,255,0.5)',
                marginBottom: '8px',
              }}
            >
              No memories yet
            </p>
            <p
              style={{
                fontSize: '13px',
                color: 'rgba(255,255,255,0.3)',
                marginBottom: '24px',
              }}
            >
              Start a conversation and missiAI will remember what matters.
            </p>
            <Link
              href="/chat"
              style={{
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.7)',
                fontSize: '13px',
                textDecoration: 'none',
              }}
            >
              Start a conversation
            </Link>
          </div>
        ) : hasNoResults ? (
          <div
            style={{
              textAlign: 'center',
              padding: '60px 24px',
              color: 'rgba(255,255,255,0.35)',
            }}
          >
            <p style={{ fontSize: '14px' }}>
              {searchQuery.trim().length >= 2
                ? `No results for "${searchQuery.trim()}"`
                : `No memories in this category`}
            </p>
          </div>
        ) : (
          <GroupedMemoryView
            nodes={filteredNodes}
            onDelete={deleteNode}
            deletingId={deletingId}
          />
        )}
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'rgba(255,255,255,0.4)',
  marginBottom: '6px',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  padding: '10px 12px',
  color: 'rgba(255,255,255,0.85)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}
