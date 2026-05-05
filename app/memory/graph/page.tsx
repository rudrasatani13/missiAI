'use client'

import { useEffect, useState } from 'react'
import nextDynamic from 'next/dynamic'
import Link from 'next/link'
import { ArrowLeft, Brain, X, Calendar, Tag, Activity } from 'lucide-react'
import { useMemoryDashboard } from '@/hooks/memory/useMemoryDashboard'
import { LifeNode } from '@/types/memory'
import { motion, AnimatePresence } from 'framer-motion'

const MemoryGraph3D = nextDynamic(() => import('@/components/memory/MemoryGraph3D'), { ssr: false })


export default function GraphPage() {
  const { graph, isLoading, error } = useMemoryDashboard()
  const [selectedNode, setSelectedNode] = useState<LifeNode | null>(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.matchMedia('(max-width: 767px)').matches)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Extract all nodes from the graph
  const nodes = graph ? graph.nodes : []

  return (
    <main
      className="min-h-dvh bg-[var(--missi-bg)] text-[var(--missi-text-primary)] px-4 pb-4 md:p-8 flex flex-col relative overflow-hidden"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      <header className="mb-4 md:mb-6 flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-2xl md:text-3xl font-medium tracking-tight">Memory Dashboard</h1>
            <Brain className="w-5 h-5 md:w-6 md:h-6 text-[var(--missi-text-muted)]" />
          </div>
          <p className="text-[var(--missi-text-secondary)] text-xs md:text-sm max-w-xl flex items-center gap-2">
            A 3D spatial view of your context. Tap any node to inspect details.
          </p>
        </div>

        <Link
          href="/memory"
          className="inline-flex items-center gap-2 text-xs md:text-sm text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] transition-colors py-1.5 md:py-2 self-start"
        >
          <ArrowLeft className="w-4 h-4" /> Back to List
        </Link>
      </header>

      <section className="flex-1 w-full relative z-0 rounded-xl overflow-hidden shadow-[0_0_50px_var(--missi-border)] border border-[var(--missi-border)] bg-[var(--missi-bg)] min-h-[calc(100dvh-160px)]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--missi-nav-hover)]">
            <div className="flex flex-col items-center gap-3 text-[var(--missi-text-muted)]">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[var(--missi-border-strong)]"></div>
              <p className="text-sm">Mapping memory clusters...</p>
            </div>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex items-center justify-center bg-red-500/5 text-red-400">
            {error}
          </div>
        ) : (
          <div className="absolute inset-0">
            <MemoryGraph3D nodes={nodes} onNodeSelect={setSelectedNode} />
          </div>
        )}

        {/* Inspector — side drawer on desktop, bottom sheet on mobile */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: 100 }}
              animate={isMobile ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 }}
              exit={isMobile ? { opacity: 0, y: '100%' } : { opacity: 0, x: 100 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="absolute z-20 flex flex-col overflow-hidden shadow-2xl border border-[var(--missi-border)] rounded-2xl
                         left-2 right-2 bottom-2 max-h-[70%]
                         md:top-4 md:bottom-4 md:right-4 md:left-auto md:w-96 md:max-h-none"
              style={{
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(25px)',
                WebkitBackdropFilter: 'blur(25px)',
              }}
            >
              <div className="p-5 border-b border-[var(--missi-border)] flex items-center justify-between">
                <h3 className="text-sm font-medium text-[var(--missi-text-secondary)] uppercase tracking-wider">Node Details</h3>
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-full bg-[var(--missi-surface)] hover:bg-[var(--missi-surface)] text-[var(--missi-text-secondary)] hover:text-[var(--missi-text-primary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                <div>
                  <h2 className="text-2xl font-medium leading-tight mb-2 text-[var(--missi-text-primary)]">{selectedNode.title}</h2>
                  <div className="inline-block px-2.5 py-1 rounded-full bg-[var(--missi-surface)] text-xs text-[var(--missi-text-secondary)] capitalize">
                    {selectedNode.category}
                  </div>
                </div>

                <div>
                  <p className="text-[var(--missi-text-secondary)] text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedNode.detail}
                  </p>
                </div>

                <div className="flex flex-col gap-4 mt-auto pt-6 border-t border-[var(--missi-border)]">
                  {selectedNode.tags && selectedNode.tags.length > 0 && (
                    <div>
                      <h4 className="flex items-center gap-1.5 text-xs text-[var(--missi-text-muted)] mb-2 uppercase tracking-wide">
                        <Tag className="w-3.5 h-3.5" /> Tags
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.tags.map(t => (
                          <span key={t} className="px-2 py-1 bg-[var(--missi-surface)] border border-[var(--missi-border)] rounded-md text-xs text-[var(--missi-text-secondary)]">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedNode.people && selectedNode.people.length > 0 && (
                    <div>
                      <h4 className="text-xs text-[var(--missi-text-muted)] mb-2 uppercase tracking-wide">People</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.people.map(p => (
                          <span key={p} className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-300 rounded-md text-xs">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="flex items-center gap-1.5 text-xs text-[var(--missi-text-muted)] mb-1 uppercase tracking-wide">
                        <Activity className="w-3.5 h-3.5" /> Confidence
                      </h4>
                      <div className="text-lg text-[var(--missi-text-secondary)]">{((selectedNode.confidence || 0) * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                       <h4 className="flex items-center gap-1.5 text-xs text-[var(--missi-text-muted)] mb-1 uppercase tracking-wide">
                        <Calendar className="w-3.5 h-3.5" /> Captured
                      </h4>
                      <div className="text-sm text-[var(--missi-text-secondary)] mt-1">
                        {new Date(selectedNode.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'})}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </main>
  )
}
