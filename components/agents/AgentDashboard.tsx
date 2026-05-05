'use client'

import { Suspense, lazy } from 'react'

const AgentDashboardContent = lazy(() => import('./AgentDashboardContent'))

export default function AgentDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-full items-center justify-center px-6 py-12">
          <div className="rounded-[28px] border border-[var(--missi-border)] bg-[var(--missi-surface)] px-8 py-10 flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-2 border-[var(--missi-border)] border-t-[var(--missi-text-secondary)] animate-spin" />
            <p className="text-sm font-light" style={{ color: 'var(--missi-text-secondary)' }}>
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
