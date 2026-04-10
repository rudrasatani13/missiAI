'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Brain, X, Calendar, Tag, Activity } from 'lucide-react'
import { useMemoryDashboard } from '@/hooks/useMemoryDashboard'
import MemoryGraph3D from '@/components/memory/MemoryGraph3D'
import { LifeNode } from '@/types/memory'
import { motion, AnimatePresence } from 'framer-motion'

export const dynamic = 'force-dynamic'

export default function GraphPage() {
  const { graph, isLoading, error } = useMemoryDashboard()
  const [selectedNode, setSelectedNode] = useState<LifeNode | null>(null)
  
  // Extract all nodes from the graph
  const nodes = graph ? graph.nodes : []

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-8 flex flex-col relative overflow-hidden">
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4 relative z-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-medium tracking-tight">Memory Dashboard</h1>
            <Brain className="w-6 h-6 text-white/40" />
          </div>
          <p className="text-white/50 text-sm max-w-xl flex items-center gap-2">
            A 3D spatial view of your context. Click any node to inspect details.
          </p>
        </div>

        <Link
          href="/memory"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors py-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to List
        </Link>
      </header>

      <section className="flex-1 w-full relative z-0 rounded-xl overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.05)] border border-white/10 bg-black min-h-[calc(100vh-140px)]">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/[0.02]">
            <div className="flex flex-col items-center gap-3 text-white/40">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/40"></div>
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

        {/* Side Inspector Panel using Framer Motion - INSIDE the main graph box */}
        <AnimatePresence>
          {selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="absolute top-4 bottom-4 right-4 left-auto w-80 md:w-96 rounded-2xl border border-white/10 z-20 flex flex-col overflow-hidden shadow-2xl"
              style={{
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(25px)',
                WebkitBackdropFilter: 'blur(25px)',
              }}
            >
              <div className="p-5 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-wider">Node Details</h3>
                <button 
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                <div>
                  <h2 className="text-2xl font-medium leading-tight mb-2 text-white/90">{selectedNode.title}</h2>
                  <div className="inline-block px-2.5 py-1 rounded-full bg-white/10 text-xs text-white/80 capitalize">
                    {selectedNode.category}
                  </div>
                </div>

                <div>
                  <p className="text-white/60 text-sm leading-relaxed whitespace-pre-wrap">
                    {selectedNode.detail}
                  </p>
                </div>

                <div className="flex flex-col gap-4 mt-auto pt-6 border-t border-white/5">
                  {selectedNode.tags && selectedNode.tags.length > 0 && (
                    <div>
                      <h4 className="flex items-center gap-1.5 text-xs text-white/40 mb-2 uppercase tracking-wide">
                        <Tag className="w-3.5 h-3.5" /> Tags
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedNode.tags.map(t => (
                          <span key={t} className="px-2 py-1 bg-white/5 border border-white/10 rounded-md text-xs text-white/60">
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedNode.people && selectedNode.people.length > 0 && (
                    <div>
                      <h4 className="text-xs text-white/40 mb-2 uppercase tracking-wide">People</h4>
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
                      <h4 className="flex items-center gap-1.5 text-xs text-white/40 mb-1 uppercase tracking-wide">
                        <Activity className="w-3.5 h-3.5" /> Confidence
                      </h4>
                      <div className="text-lg text-white/80">{((selectedNode.confidence || 0) * 100).toFixed(0)}%</div>
                    </div>
                    <div>
                       <h4 className="flex items-center gap-1.5 text-xs text-white/40 mb-1 uppercase tracking-wide">
                        <Calendar className="w-3.5 h-3.5" /> Captured
                      </h4>
                      <div className="text-sm text-white/80 mt-1">
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
