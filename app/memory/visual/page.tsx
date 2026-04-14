'use client'

export const dynamic = 'force-dynamic'

import { VisualMemoryGallery } from '@/components/memory/VisualMemoryGallery'
import { ArrowLeft, Camera } from 'lucide-react'
import Link from 'next/link'
import { motion } from 'framer-motion'

export default function VisualMemoryPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(20,20,30,1) 0%, #000000 60%)',
        color: 'rgba(255,255,255,0.85)',
      }}
    >
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-15%] left-[30%] w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(0,255,140,0.05) 0%, transparent 70%)' }} />
        <div className="absolute bottom-[-10%] right-[15%] w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.04) 0%, transparent 70%)' }} />
      </div>

      <div className="relative z-10 max-w-[960px] mx-auto px-4 md:px-6 py-6 md:py-8">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center justify-between mb-7"
        >
          <Link
            href="/memory"
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-white/5 transition-all text-white/50 hover:text-white/80 no-underline text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Memory</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <Camera className="w-5 h-5" style={{ color: 'rgba(255,255,255,0.4)' }} />
            <h1 className="text-base md:text-lg font-medium m-0" style={{ color: 'rgba(255,255,255,0.9)' }}>
              Visual Memories
            </h1>
          </div>

          <Link
            href="/chat"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all hover:scale-105 no-underline"
            style={{
              background: 'rgba(0,255,140,0.08)',
              border: '1px solid rgba(0,255,140,0.15)',
              color: 'rgba(0,255,140,0.8)',
            }}
          >
            <Camera className="w-3 h-3" /> Add Memory
          </Link>
        </motion.div>

        {/* Gallery */}
        <VisualMemoryGallery />
      </div>
    </div>
  )
}
