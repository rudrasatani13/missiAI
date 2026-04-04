'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Brain } from 'lucide-react'
import { useMemoryDashboard } from '@/hooks/useMemoryDashboard'
import MemoryGraph3D from '@/components/memory/MemoryGraph3D'

export const dynamic = 'force-dynamic'

export default function GraphPage() {
  const { graph, isLoading, error } = useMemoryDashboard()
  
  // Extract all nodes from the graph
  const nodes = graph ? graph.nodes : []

  return (
    <main className="min-h-screen bg-black text-white p-6 md:p-8 flex flex-col">
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-medium tracking-tight">Neural Network</h1>
            <Brain className="w-6 h-6 text-white/40" />
          </div>
          <p className="text-white/50 text-sm max-w-xl">
            A 3D visualization of Missi's context graph. Nodes connect automatically based on shared memories, people, and topics.
          </p>
        </div>

        <Link
          href="/memory"
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors py-2"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </header>

      <section className="flex-1 min-h-[60vh] w-full">
        {isLoading ? (
          <div className="w-full h-[60vh] flex items-center justify-center border border-white/5 bg-white/[0.02] rounded-xl">
            <div className="flex flex-col items-center gap-3 text-white/40">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/40"></div>
              <p className="text-sm">Mapping memory clusters...</p>
            </div>
          </div>
        ) : error ? (
          <div className="w-full h-[60vh] flex items-center justify-center border border-red-500/20 bg-red-500/5 rounded-xl text-red-400">
            {error}
          </div>
        ) : (
          <MemoryGraph3D nodes={nodes} />
        )}
      </section>
    </main>
  )
}
