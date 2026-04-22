'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TimelineEvent, LifeChapter } from '@/types/life-story'
import { X, Calendar as CalendarIcon, Clock, ArrowRight } from 'lucide-react'

const getColor = (category: string) => {
  const colors: Record<string, string> = {
    person: '#3b82f6',
    goal: '#22c55e',
    habit: '#f59e0b',
    event: '#ef4444',
    emotion: '#d946ef',
    place: '#0ea5e9',
    preference: '#8b5cf6',
    skill: '#eab308',
    belief: '#f43f5e',
    relationship: '#ec4899'
  }
  return colors[category] || '#ffffff'
}

export function TimelineView() {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [chapters, setChapters] = useState<LifeChapter[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null)

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true)
      try {
        const res = await fetch('/api/v1/life-story/timeline')
        if (res.ok) {
          const data = await res.json()
          setEvents(data.events || [])
          setChapters(data.chapters || [])
        }
      } catch (e) {
        console.error(e)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [])

  const filteredEvents = useMemo(() => {
    let sorted = [...events].sort((a, b) => b.timestamp - a.timestamp) // Newest first
    if (activeChapterId) {
      sorted = sorted.filter(e => e.chapterId === activeChapterId)
    }
    return sorted
  }, [events, activeChapterId])

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/50 space-y-4 h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/20"></div>
        <p className="text-sm tracking-widest uppercase">Building timeline...</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-white/50 h-full">
        <CalendarIcon className="w-12 h-12 mb-4 text-white/20" />
        <p>Your timeline is waiting to be written.</p>
        <p className="text-sm mt-2 opacity-60">Try chatting with Missi to add memories.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 w-full h-full relative overflow-hidden flex flex-col bg-[#020205]">
      
      {/* Dynamic Header Filter */}
      <div className="absolute top-0 left-0 right-0 z-20 p-4 sm:p-6 pointer-events-none">
        <AnimatePresence>
          {activeChapterId && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="mx-auto max-w-fit flex items-center gap-3 bg-black/60 backdrop-blur-xl rounded-full pl-5 pr-2 py-2 border border-white/10 shadow-2xl pointer-events-auto"
            >
              <span className="text-xs text-white/50 font-medium uppercase tracking-widest">Chapter Focus</span>
              <span className="text-sm font-semibold text-white">
                {chapters.find(c => c.id === activeChapterId)?.title}
              </span>
              <button 
                onClick={() => setActiveChapterId(null)}
                aria-label="Clear chapter filter"
                className="ml-2 bg-white/5 hover:bg-white/15 p-1.5 rounded-full transition-colors text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Vertical Scroll Area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide pt-24 pb-32 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto relative">
          
          {/* Connecting Vertical Line */}
          <div className="absolute top-0 bottom-0 left-[24px] md:left-1/2 w-0.5 bg-gradient-to-b from-transparent via-white/10 to-transparent -translate-x-1/2 rounded-full" />

          {/* Events mapped sequentially */}
          {filteredEvents.map((event, i) => {
            const isLeft = i % 2 !== 0; // Alternate sides on desktop
            const color = getColor(event.category)
            const dateStr = new Date(event.timestamp).toLocaleDateString(undefined, { month: 'short', year: 'numeric', day: 'numeric' })
            
            return (
              <motion.div 
                key={event.nodeId}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className={`relative flex items-center justify-end md:justify-between w-full mb-12 sm:mb-20 ${isLeft ? 'md:flex-row-reverse' : ''}`}
              >
                {/* Desktop Empty Space (opposing side) */}
                <div className="hidden md:block w-[45%]" />

                {/* The Timeline Node / Orb */}
                <div className="absolute left-[24px] md:left-1/2 -translate-x-1/2 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-[#020205] flex items-center justify-center p-1 relative z-10 border border-white/5">
                    <motion.div 
                      className="w-full h-full rounded-full"
                      style={{ background: color, boxShadow: `0 0 20px ${color}80` }}
                      whileHover={{ scale: 1.5 }}
                    />
                  </div>
                </div>

                {/* Content Card */}
                <div className="w-[calc(100%-60px)] md:w-[45%]">
                  <div className="relative group">
                    {/* Connecting dashed line (orb to card) */}
                    <div 
                      className={`absolute top-1/2 -translate-y-1/2 w-6 border-t border-dashed border-white/20 hidden md:block`}
                      style={{ [isLeft ? 'right' : 'left']: '-1.5rem' }}
                    />

                    {/* Card Body */}
                    <div 
                      className="bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-md rounded-2xl p-5 sm:p-6 border border-white/10 transition-colors shadow-2xl relative overflow-hidden"
                    >
                      {/* Top accent line */}
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: `linear-gradient(90deg, transparent, ${color}, transparent)` }} />
                      
                      <div className="flex items-center gap-2 mb-3">
                        <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider" style={{ color: color, backgroundColor: `${color}15` }}>
                          {event.category}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-white/40 ml-auto font-mono">
                          <Clock className="w-3.5 h-3.5" />
                          {dateStr}
                        </div>
                      </div>

                      <h3 className="text-xl font-medium text-white/90 leading-tight mb-2">
                        {event.title}
                      </h3>

                      {/* Optional Chapter Link (if not already filtered) */}
                      {!activeChapterId && event.chapterId && (
                        <div className="mt-4 pt-3 border-t border-white/5">
                          <button 
                            onClick={() => setActiveChapterId(event.chapterId!)}
                            className="group/btn flex items-center gap-2 text-xs text-white/40 hover:text-white transition-colors uppercase tracking-widest font-semibold"
                          >
                            Chapter: {chapters.find(c => c.id === event.chapterId)?.title || 'Narrative Segment'}
                            <ArrowRight className="w-3 h-3 group-hover/btn:translate-x-1 transition-transform" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>
        
        {/* End of timeline indicator */}
        <div className="w-full flex justify-center mt-8">
          <div className="w-3 h-3 rounded-full border border-white/20 bg-transparent" />
        </div>
      </div>
    </div>
  )
}
