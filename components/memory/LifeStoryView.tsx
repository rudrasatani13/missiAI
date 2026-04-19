'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Clock, Layers, Star, Download, Sparkles } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { TimelineView } from './TimelineView'
import { ChaptersView } from './ChaptersView'
import { YearInReviewView } from './YearInReviewView'
import { ConstellationView } from './ConstellationView'

type Tab = 'timeline' | 'chapters' | 'year' | 'constellation'

export function LifeStoryView() {
  const [activeTab, setActiveTab] = useState<Tab>('timeline')

  return (
    <main
      className="min-h-dvh bg-black text-white px-4 pb-4 md:p-8 flex flex-col relative overflow-hidden"
      style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
    >
      {/* Background gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[10%] w-[500px] h-[500px] rounded-full" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />
      </div>

      <header className="mb-5 md:mb-6 flex flex-col md:flex-row md:items-end justify-between gap-3 md:gap-4 relative z-10 w-full max-w-6xl mx-auto">
        <div>
          <div className="flex items-center gap-2.5 md:gap-3 mb-1.5 md:mb-2">
            <h1 className="text-2xl md:text-3xl font-medium tracking-tight">Life Story</h1>
            <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-white/40" />
          </div>
          <p className="text-white/50 text-xs md:text-sm max-w-xl">
            A beautiful, multi-dimensional view of the moments, people, and feelings that make up your life.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              window.location.href = '/api/v1/life-story/export'
            }}
            className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full text-[11px] md:text-xs font-medium transition-all hover:scale-105 border border-white/10 bg-white/5 hover:bg-white/10 text-white/80"
          >
            <Download className="w-3.5 h-3.5" /> Export Data
          </button>

          <Link
            href="/memory"
            className="inline-flex items-center gap-2 text-xs md:text-sm text-white/50 hover:text-white transition-colors py-1.5 md:py-2"
          >
            <ArrowLeft className="w-4 h-4" /> Back to List
          </Link>
        </div>
      </header>

      <div className="relative z-10 w-full max-w-6xl mx-auto flex-1 flex flex-col">
        {/* Tab Bar — scrolls edge-to-edge on mobile */}
        <div className="flex items-center gap-2 mb-5 md:mb-6 overflow-x-auto scrollbar-hide pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          <Link
            href="/memory/graph"
            className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium transition-colors border border-white/10 bg-transparent text-white/60 hover:text-white hover:bg-white/5"
          >
            <Sparkles className="w-4 h-4" /> 3D Graph
          </Link>

          <div className="w-px h-6 bg-white/10 mx-1 md:mx-2 flex-shrink-0" />

          {[
            { id: 'timeline', label: 'Timeline', icon: Clock },
            { id: 'chapters', label: 'Chapters', icon: Layers },
            { id: 'year', label: 'Year in Review', icon: BookOpen },
            { id: 'constellation', label: 'Constellation', icon: Star },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as Tab)}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium transition-all ${
                activeTab === t.id
                  ? 'bg-white/15 text-white border border-white/20 shadow-lg'
                  : 'bg-transparent text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 w-full relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden min-h-[60dvh] md:min-h-[600px] shadow-2xl flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex-1 w-full h-full flex flex-col overflow-hidden"
            >
              {activeTab === 'timeline' && <TimelineView />}
              {activeTab === 'chapters' && <ChaptersView />}
              {activeTab === 'year' && <YearInReviewView />}
              {activeTab === 'constellation' && <ConstellationView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </main>
  )
}
