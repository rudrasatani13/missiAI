'use client'

import { Suspense, lazy } from 'react'

const AgentDashboardContent = lazy(() => import('./AgentDashboardContent'))

export default function AgentDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center px-6 py-12">
          <div className="rounded-[28px] border border-white/10 bg-black/45 px-8 py-10 flex flex-col items-center gap-4 backdrop-blur-xl">
            <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-white/60 animate-spin" />
            <p className="text-sm font-light" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Loading agent workspace...
            </p>
          </div>
        </div>
      }
    >
      <AgentDashboardContent />
    </Suspense>
  )
}
