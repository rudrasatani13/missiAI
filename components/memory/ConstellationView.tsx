'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ConstellationGrouping } from '@/types/life-story'
import { AlertCircle } from 'lucide-react'

type Mode = 'by_category' | 'by_time' | 'by_emotion' | 'by_people'

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

// Pseudo-random generator for stable node positions
function mulberry32(a: number) {
  return function() {
    var t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

export function ConstellationView() {
  const [mode, setMode] = useState<Mode>('by_category')
  const [grouping, setGrouping] = useState<ConstellationGrouping | null>(null)
  const [nodeCount, setNodeCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [hoverText, setHoverText] = useState<string | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    async function fetchConstellation() {
      setIsLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/v1/life-story/constellation?mode=${mode}`)
        if (res.ok) {
          const data = await res.json()
          setGrouping(data.grouping)
          setNodeCount(data.nodeCount || 0)
        } else {
          setError('Failed to load constellation data')
        }
      } catch (e) {
        setError('Network error')
      } finally {
        setIsLoading(false)
      }
    }
    fetchConstellation()
  }, [mode])

  const stars = useMemo(() => {
    const s = []
    const rand = mulberry32(12345)
    for (let i = 0; i < 250; i++) {
      s.push({
        id: i,
        x: rand() * 100,
        y: rand() * 100,
        r: rand() * 0.8 + 0.1,
        o: rand() * 0.4 + 0.1,
        duration: rand() * 3 + 2
      })
    }
    return s
  }, [])

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-white/50 space-y-4 h-full min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white/20"></div>
        <p className="text-sm tracking-widest uppercase">Mapping the stars...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-red-400 space-y-4 h-full min-h-[400px]">
        <AlertCircle className="w-8 h-8" />
        <p>{error}</p>
      </div>
    )
  }

  if (nodeCount === 0 || !grouping) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/50 p-8 text-center h-full min-h-[400px]">
        The sky is empty. Talk to Missi to form your first constellation.
      </div>
    )
  }

  return (
    <div 
      className="flex-1 w-full h-full flex flex-col relative overflow-hidden bg-[#020205] rounded-xl"
      onMouseMove={(e) => {
        const bounds = e.currentTarget.getBoundingClientRect()
        setMousePos({ x: e.clientX - bounds.left, y: e.clientY - bounds.top })
      }}
    >
      {/* Dynamic Background Glow based on mouse tracking — desktop/hover only */}
      <div
        className="absolute pointer-events-none transition-transform duration-100 ease-out no-touch-hover"
        style={{
          left: mousePos.x,
          top: mousePos.y,
          transform: 'translate(-50%, -50%)',
          width: '400px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, rgba(0,0,0,0) 60%)',
          zIndex: 0
        }}
      />

      {/* Mode Switcher */}
      <div className="absolute top-3 sm:top-6 left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-1 sm:gap-2 bg-black/50 backdrop-blur-xl p-1 sm:p-1.5 rounded-full border border-white/10 shadow-2xl max-w-[calc(100vw-24px)]">
        {[
          { id: 'by_category', label: 'Category' },
          { id: 'by_time', label: 'Time' },
          { id: 'by_emotion', label: 'Emotion' },
          { id: 'by_people', label: 'People' },
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as Mode)}
            className={`px-2.5 py-1 sm:px-4 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold tracking-wide transition-all whitespace-nowrap ${
              mode === m.id ? 'bg-white text-black shadow-md scale-105' : 'text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Rendering Canvas */}
      <div className="flex-1 w-full h-full relative cursor-crosshair overflow-hidden touch-pan-x touch-pan-y z-10">
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" className="w-full h-full absolute inset-0">
          <defs>
            <filter id="strongGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            <filter id="softGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="0.8" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>

          {/* Deep Space Stars */}
          <g opacity="0.6">
            {stars.map(s => (
              <motion.circle 
                key={s.id} 
                cx={s.x} 
                cy={s.y} 
                r={s.r} 
                fill="#ffffff" 
                animate={{ opacity: [s.o * 0.5, s.o * 1.5, s.o * 0.5] }}
                transition={{ duration: s.duration, repeat: Infinity, ease: 'easeInOut' }}
              />
            ))}
          </g>

          {/* Clusters */}
          {grouping.clusters.map((cluster, i) => {
            const cx = cluster.centerX * 100
            const cy = cluster.centerY * 100
            
            // Random seeded generator for this cluster
            const rand = mulberry32(100 + i)
            
            // Generate node positions first so we can draw connecting web lines
            const clusterNodes = cluster.nodeIds.map((id, j) => {
              const angle = rand() * Math.PI * 2
              const dist = 3 + (rand() * 18) // Spread 3-21%
              const nx = cx + Math.cos(angle) * dist
              const ny = cy + Math.sin(angle) * dist
              return { id, nx, ny, idx: j }
            })

            // Derive an aggregate cluster color based on label if known, or fallback
            // In a strict app we'd map this safely. Let's use a nice default or the label if it matches a category
            const clusterColor = getColor(cluster.label.toLowerCase()) !== '#ffffff' ? getColor(cluster.label.toLowerCase()) : '#a78bfa'

            return (
              <motion.g 
                key={`cluster-${i}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 1, delay: i * 0.1 }}
              >
                {/* Connecting Web Lines */}
                {clusterNodes.map((n, j) => {
                  if (j === 0) return null
                  const prev = clusterNodes[j - 1]
                  // Draw line from previous node to this node to form a constellation chain
                  return (
                    <line 
                      key={`line-${n.id}`}
                      x1={prev.nx} 
                      y1={prev.ny} 
                      x2={n.nx} 
                      y2={n.ny} 
                      stroke={clusterColor} 
                      strokeWidth="0.15" 
                      opacity="0.3" 
                      strokeDasharray="1, 0.5"
                    />
                  )
                })}
                
                {/* Lines to Center (Hub and spoke overlay) */}
                {clusterNodes.slice(0, Math.min(3, clusterNodes.length)).map(n => (
                  <line 
                    key={`hub-${n.id}`}
                    x1={cx} 
                    y1={cy} 
                    x2={n.nx} 
                    y2={n.ny} 
                    stroke="#ffffff" 
                    strokeWidth="0.05" 
                    opacity="0.1" 
                  />
                ))}

                {/* Center Label Pill */}
                <g className="cursor-pointer" onMouseEnter={() => setHoverText(`Cluster: ${cluster.label} (${cluster.nodeIds.length} nodes)`)} onMouseLeave={() => setHoverText(null)}>
                  <circle cx={cx} cy={cy} r="1.2" fill="#ffffff" opacity="0.1" filter="url(#strongGlow)" />
                  <circle cx={cx} cy={cy} r="0.4" fill="#ffffff" opacity="0.8" />
                  <text 
                    x={cx} 
                    y={cy + 3} 
                    fill="#ffffff" 
                    opacity="0.95" 
                    fontSize="1.8" 
                    fontWeight="700"
                    textAnchor="middle" 
                    className="pointer-events-none select-none uppercase tracking-[0.2em] font-sans"
                    style={{ textShadow: '0px 0px 8px rgba(0,0,0,0.8), 0px 2px 4px rgba(0,0,0,0.9)' }}
                  >
                    {cluster.label}
                  </text>
                </g>

                {/* Nodes in Cluster */}
                {clusterNodes.map((n) => {
                  return (
                    <motion.circle 
                      key={n.id}
                      initial={{ cx: cx, cy: cy, r: 0 }}
                      animate={{ cx: n.nx, cy: n.ny, r: rand() * 0.8 + 0.6 }}
                      transition={{ duration: 1.5, type: 'spring', bounce: 0.2, delay: n.idx * 0.05 }}
                      fill={clusterColor}
                      opacity={0.9}
                      filter="url(#softGlow)"
                      className="cursor-pointer hover:stroke-white hover:stroke-[0.3]"
                      onMouseEnter={() => setHoverText(`Node ${n.id.slice(0,5)}...`)}
                      onMouseLeave={() => setHoverText(null)}
                      whileHover={{ scale: 1.5 }}
                    />
                  )
                })}
              </motion.g>
            )
          })}
        </svg>

        {/* Floating Tooltip */}
        <AnimatePresence>
          {hoverText && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 5 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="absolute pointer-events-none z-50 bg-black/80 backdrop-blur-md border border-white/20 px-3 py-1.5 rounded-md text-xs font-medium text-white shadow-xl shadow-black/50"
              style={{
                left: mousePos.x + 15,
                top: mousePos.y + 15,
              }}
            >
              {hoverText}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
