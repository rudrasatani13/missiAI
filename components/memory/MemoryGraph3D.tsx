"use client"

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { LifeNode } from '@/types/memory'
import dynamic from 'next/dynamic'

// Dynamically import the ForceGraph3D component to disable SSR since Canvas doesn't work server-side
const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), { ssr: false })

export default function MemoryGraph3D({
  nodes,
  onNodeSelect
}: {
  nodes: LifeNode[]
  onNodeSelect?: (node: LifeNode | null) => void
}) {
  const fgRef = useRef<any>(null)
  // Generate links based on shared categories, tags, and people
  const graphData = useMemo(() => {
    const links: any[] = []
    
    // Simple naive linking mapping nodes to each other based on shared context
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const n1 = nodes[i]
        const n2 = nodes[j]
        
        let linkValue = 0

        // Link by shared tags
        let sharedTags = 0
        n1.tags.forEach(t => { if (n2.tags.includes(t)) sharedTags++ })
        linkValue += sharedTags * 2

        // Link by shared people
        let sharedPeople = 0
        n1.people.forEach(p => { if (n2.people.includes(p)) sharedPeople++ })
        linkValue += sharedPeople * 3

        // Link weakly by category
        if (n1.category === n2.category) {
          linkValue += 0.5
        }

        if (linkValue > 0) {
          links.push({
            source: n1.id,
            target: n2.id,
            value: linkValue
          })
        }
      }
    }

    return {
      nodes: nodes.map(n => ({
        ...n,
        // Make nodes size proportional to emotional weight/confidence
        val: ((n.emotionalWeight || 0.5) + (n.confidence || 0.5)) * 5
      })),
      links
    }
  }, [nodes])

  // Map categories to colors
  const getColor = (category: string) => {
    const colors: Record<string, string> = {
      person: '#3b82f6', // blue
      goal: '#22c55e',   // green
      habit: '#f59e0b',  // amber
      event: '#ef4444',  // red
      emotion: '#d946ef',// fuchsia
      place: '#0ea5e9',  // sky
      preference: '#8b5cf6', // violet
      skill: '#eab308',  // yellow
      belief: '#f43f5e', // rose
      relationship: '#ec4899' // pink
    }
    return colors[category] || '#ffffff'
  }

  // Auto-resize viewport
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current) {
      const { clientWidth, clientHeight } = containerRef.current
      setDimensions({ width: clientWidth, height: clientHeight })
    }
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({ width: containerRef.current.clientWidth, height: containerRef.current.clientHeight })
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  if (nodes.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center text-white/50 space-y-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white/20"></div>
        <p>Loading neural pathways...</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative">
      
      {/* Overlay UI elements */}
      <div className="absolute top-4 left-4 z-10 pointer-events-none">
        <h2 className="text-white/80 font-medium text-lg leading-none">LifeGraph Visualizer</h2>
        <p className="text-white/40 text-xs mt-1">{nodes.length} Nodes & {graphData.links.length} Connections</p>
      </div>

      <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex flex-col gap-1">
        <div className="text-white/30 text-[10px] uppercase tracking-widest px-2 py-1 bg-white/5 rounded backdrop-blur-md border border-white/10">Drag node to Pin</div>
        <div className="text-white/30 text-[10px] uppercase tracking-widest px-2 py-1 bg-white/5 rounded backdrop-blur-md border border-white/10">Click node to Unpin</div>
        <div className="text-white/30 text-[10px] uppercase tracking-widest px-2 py-1 bg-white/5 rounded backdrop-blur-md border border-white/10 mt-2">Scroll/Drag Background to Rotate</div>
      </div>

      <ForceGraph3D
        ref={fgRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeLabel="title"
        nodeColor={(node: any) => getColor(node.category)}
        nodeRelSize={7}
        nodeResolution={32}
        nodeOpacity={0.85}
        linkWidth={(link: any) => Math.min(link.value * 0.3, 2)}
        linkOpacity={0.4}
        linkColor={() => 'rgba(255, 255, 255, 0.15)'}
        linkDirectionalParticles={1}
        linkDirectionalParticleWidth={1.5}
        linkDirectionalParticleColor={() => 'rgba(255, 255, 255, 0.6)'}
        backgroundColor="#000000"
        enableNodeDrag={true}
        onNodeDragEnd={(node: any) => {
          node.fx = node.x
          node.fy = node.y
          node.fz = node.z
        }}
        onNodeClick={(node: any) => {
          if (fgRef.current) {
            const distance = 80
            const distRatio = 1 + distance / Math.max(Math.hypot(node.x, node.y, node.z), 1)
            fgRef.current.cameraPosition(
              { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio },
              node,
              1500
            )
          }
          if (onNodeSelect) {
            onNodeSelect(node)
          }
          // Temporarily pin so it doesn't move while inspecting
          node.fx = node.x
          node.fy = node.y
          node.fz = node.z
        }}
        onBackgroundClick={() => {
          if (onNodeSelect) onNodeSelect(null)
        }}
        showNavInfo={false}
      />
    </div>
  )
}
